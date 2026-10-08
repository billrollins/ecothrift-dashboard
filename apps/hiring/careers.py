"""The careers file, ``ecothrift.careers/1``: one document for everything the owner edits.

Stored in AppSetting ``hiring.careers`` (page text, shared form questions, emails, the
on/off switch). Jobs are ``Job`` rows; the exported file carries them too, so one YAML
or JSON file round-trips through any AI chat and back (Copy for AI → paste → check → Save).
The database is the truth; the file is how it goes in and out.
"""
from __future__ import annotations

import copy
import re
import secrets
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils.text import slugify

from apps.core.models import AppSetting, AppSettingHistory

FORMAT = 'ecothrift.careers/1'
SETTING_KEY = 'hiring.careers'

QUESTION_TYPES = ('yes_no', 'text', 'long_text', 'number', 'choice', 'multi', 'date', 'time')
JOB_STATUSES = ('draft', 'open', 'paused', 'closed')
JOB_TYPES = ('full_time', 'part_time', 'full_or_part')
EMAIL_KEYS = (
    'received', 'alert', 'interview_invite', 'interview_booked', 'interview_changed', 'interview_cancelled',
    'interview_reminder', 'interview_notice', 'offer_letter', 'offer_sent', 'offer_signed', 'offer_notice',
    'first_day',
)
NOT_NOW_KEYS = ('default', 'withdrew', 'position_closed', 'no_show')
# Every email template by one flat key; a role can carry its own version of any of them (Job.emails).
TEMPLATE_KEYS = EMAIL_KEYS + tuple(f'not_now.{key}' for key in NOT_NOW_KEYS)

# Wording shown next to the phone field (and on the offer page). Changing it means a new version (D17: record the
# wording); the 10DLC campaign quotes it. v2 (master, T71) adds the first day; a v1 tick gets interview texts only.
SMS_CONSENT_VERSION = 'hiring-sms-2026-10-07'
SMS_CONSENT_TEXT = (
    "Text me about my application and, if I'm hired, my first day (interview times, reminders, first-day details). "
    'Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. '
    'Terms: ecothrift.us/terms · Privacy: ecothrift.us/privacy.'
)
SMS_CONSENT_V1 = 'hiring-sms-2026-10-06'  # "about my application (interview times and reminders)": no first-day texts
# Wording versions whose tick covers a first-day text.
FIRST_DAY_VERSIONS = (SMS_CONSENT_VERSION,)

# What an AI must never put on the form (the brief carries this; the check warns on obvious misses).
NEVER_ASK = [
    'age or date of birth (only "Are you 18 or older?")',
    'race, color, religion, national origin or ancestry',
    'citizenship (only "Are you authorized to work in the US?")',
    'marital status, children, pregnancy or family plans',
    'disability, health, medical history or genetic information',
    'arrests or criminal history',
    'sex, sexual orientation or gender identity',
]
_NEVER_ASK_WORDS = re.compile(
    r'\b(how old|date of birth|birth ?date|religion|church|married|marital|pregnan|children|kids|'
    r'disabilit|medical|citizen of|nationality|national origin|criminal|convicted|arrest|felony|race)\b',
    re.IGNORECASE,
)
# Numbers Dash never stores (initiative rule): a question asking for one is refused, not just warned about.
_NEVER_STORE_WORDS = re.compile(
    r'\b(social security|ssn|routing( number)?|bank account|account number|tax id|itin|'
    r"driver'?s? licen[cs]e (number|no|#)|licen[cs]e number|passport number|alien number|a-number)\b",
    re.IGNORECASE,
)

DEFAULT_PAGE = {
    'headline': 'Now hiring',
    'roles_line': 'Retail · Processing · Restoration',
    'intro': [
        "We're a small team with a big dream. Our mission: Another Chance for Everything and Everyone.",
        'For Omaha, that means good items at dramatically lower prices than new. For the items, it means we '
        'test, repair and restore what needs it instead of letting it go to waste. Down the road, it will mean '
        'a place to sell your own items too. And for people, it means we hire those who believe in what we\'re '
        'building, including people who need a second chance themselves.',
    ],
    'hours_line': 'Three roles, up to 40 hours a week.',
    'pay': 'Pay is based on skill, not years on a resume. We set it from your interview and what we believe you can do.',
    'what_we_ask': (
        "Come in knowing we're a small team and we need your 100%. We want proactive people who see what needs "
        "doing and do it. If that's not you, please don't apply. If it is, we'd love to meet you."
    ),
    'apply_note': 'It takes about 5 minutes. A resume is optional.',
    'growth': (
        "There's room to grow. Each area (retail, processing and restoration) needs a great leader. Show us you're great "
        'at the work and can bring others along, and you can step up to lead it.'
    ),
    'photo_url': '',
}

_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

# Each area has a lead; these two (optional) help the owner spot people who could grow into it.
LEAD_INTEREST_KEY = 'lead_interest'
LEAD_QUESTIONS = [
    {'key': LEAD_INTEREST_KEY, 'label': 'Down the road, would you like to lead your area?', 'type': 'choice',
     'required': False, 'options': ['Yes', 'Maybe', 'No, I just want to do great work']},
    {'key': 'led_before', 'label': 'Have you led a team, trained someone, or run something on your own? Tell us about it.',
     'type': 'long_text', 'required': False},
]

DEFAULT_QUESTIONS = [
    {'key': 'hours_per_week', 'label': 'How many hours a week do you want?', 'type': 'number', 'required': True,
     'help': 'Up to 40.'},
    {'key': 'days', 'label': 'Which days can you work?', 'type': 'multi', 'required': True, 'options': _DAYS},
    {'key': 'earliest_start', 'label': 'Earliest start', 'type': 'time', 'required': False},
    {'key': 'latest_finish', 'label': 'Latest finish', 'type': 'time', 'required': False},
    {'key': 'start_date', 'label': 'When can you start?', 'type': 'text', 'required': True},
    {'key': 'transportation', 'label': 'Do you have reliable transportation to 8425 West Center Road?',
     'type': 'yes_no', 'required': True, 'must_be': 'yes', 'flag_label': 'Transportation'},
    {'key': 'lifting', 'label': 'Can you lift 50 lbs and stay on your feet for a full shift, with or without accommodation?',
     'type': 'yes_no', 'required': True, 'must_be': 'yes', 'flag_label': 'Lift 50 lbs'},
    {'key': 'age_18', 'label': 'Are you 18 or older?', 'type': 'yes_no', 'required': True, 'must_be': 'yes',
     'flag_label': '18+'},
    {'key': 'work_authorized', 'label': 'Are you authorized to work in the US?', 'type': 'yes_no', 'required': True,
     'must_be': 'yes', 'flag_label': 'Authorized'},
    {'key': 'pay_wanted', 'label': 'What hourly pay are you looking for?', 'type': 'text', 'required': True},
    {'key': 'why_us', 'label': 'Why Eco-Thrift?', 'type': 'long_text', 'required': True},
    {'key': 'proactive', 'label': 'Tell us about a time you saw something that needed doing and did it without being asked.',
     'type': 'long_text', 'required': True},
    *LEAD_QUESTIONS,
    {'key': 'heard_about', 'label': 'How did you hear about us?', 'type': 'choice', 'required': False,
     'options': ['Facebook', 'Indeed', 'A friend or someone who works here', 'In the store', 'Google', 'Other'],
     'after_roles': True},
]

_SIGN_OFF = 'Eco-Thrift\n8425 West Center Road, Omaha, NE 68124\nAnother Chance for Everything and Everyone'

# The store's mailboxes Dash can send from (Microsoft Graph). Sender, Reply-To and the alert list pick from these;
# the first is the default sender.
MAILBOXES = ('retail@ecothrift.us', 'bill_rollins@ecothrift.us', 'warehouse@ecothrift.us')

DEFAULT_EMAIL = {
    'from': MAILBOXES[0],
    'reply_to': 'bill_rollins@ecothrift.us',
    'notify': 'bill_rollins@ecothrift.us',
    'review_day': 'a few times a week',
    'reply_days': 7,
    'received': {
        'subject': 'We got your application, {first_name}',
        'body': (
            'Thanks for applying to Eco-Thrift. Your application for {roles} is in, and a real person will read it.\n\n'
            "Here's what happens next. We review applications {review_day}. If it looks like a fit, we'll call or "
            "text you at {phone} to set up an in-person interview at the store. If you don't hear from us within "
            "{reply_days} days, we've gone another direction for now, and we'll keep your application on file.\n\n"
            "One thing to know before we talk: we're a small team with a big dream, and we hire people who are "
            "proactive and give 100%. If that's you, we're looking forward to meeting you.\n\n" + _SIGN_OFF
        ),
    },
    'alert': {
        'subject': 'New application: {first_name} {last_name} ({roles})',
        'body': '{first_name} {last_name} applied for {roles}.\n\nPhone: {phone}\nEmail: {email}\nFlags: {flags}\n\nOpen in Dash: {dash_link}',
    },
    'not_now': {
        'default': {
            'subject': 'Your application at Eco-Thrift',
            'body': (
                'Hi {first_name},\n\nThank you for applying to Eco-Thrift for {roles}. We have decided not to move '
                'forward with your application right now.\n\nWe keep applications on file, and we will reach out if '
                'a role opens that fits. Thanks again for your interest in what we are building.\n\n' + _SIGN_OFF
            ),
        },
        'withdrew': {
            'subject': 'Your application at Eco-Thrift',
            'body': (
                'Hi {first_name},\n\nThanks for letting us know. We have closed your application for {roles}. '
                'If things change, you are welcome to apply again at ecothrift.us/careers.\n\n' + _SIGN_OFF
            ),
        },
        'position_closed': {
            'subject': 'Your application at Eco-Thrift',
            'body': (
                'Hi {first_name},\n\nThank you for applying to Eco-Thrift. The {roles} position has been filled, so '
                'we are closing your application for now. We will keep it on file and reach out if another opening '
                'fits.\n\n' + _SIGN_OFF
            ),
        },
        'no_show': {
            'subject': 'We missed you at your interview',
            'body': (
                'Hi {first_name},\n\nWe missed you at your interview for {roles}. If you are still interested, reply '
                'to this email and we will see if another time works. Otherwise, we will close your application for '
                'now.\n\n' + _SIGN_OFF
            ),
        },
    },
    # Interviews (Phase 2). Extra placeholders: {when} {place} {interviewer} {link} {link_days} {length};
    # the staff notice also has {applicant} {action} {dash_link}.
    'interview_invite': {
        'subject': 'Pick your interview time at Eco-Thrift',
        'body': (
            "Hi {first_name},\n\nThanks for applying for {roles}. We'd like to meet you. Pick a time that works "
            'for you here:\n\n{link}\n\nInterviews are at our Canfield store, 8425 West Center Road, and take about '
            '{length} minutes. This link is just for you and works for {link_days} days; use it later to change or '
            'cancel.\n\n' + _SIGN_OFF
        ),
    },
    'interview_booked': {
        'subject': 'Your Eco-Thrift interview: {when}',
        'body': (
            "Hi {first_name},\n\nYou're set. Your interview for {roles} is {when} at {place}. You'll meet "
            '{interviewer}. When you arrive, come to the register and ask for {interviewer}. Plan on about {length} '
            "minutes.\n\nNeed to change or cancel? Use your link: {link}\n\nThe attached calendar file adds it to "
            'your phone.\n\n' + _SIGN_OFF
        ),
    },
    'interview_changed': {
        'subject': 'Your Eco-Thrift interview moved to {when}',
        'body': (
            'Hi {first_name},\n\nYour interview for {roles} is now {when} at {place}, with {interviewer}.\n\n'
            'Need to change it again or cancel? Use your link: {link}\n\n' + _SIGN_OFF
        ),
    },
    'interview_cancelled': {
        'subject': 'Your Eco-Thrift interview is cancelled',
        'body': (
            "Hi {first_name},\n\nYour interview for {roles} on {when} is cancelled. If you'd still like to meet, "
            'pick a new time here: {link}\n\n' + _SIGN_OFF
        ),
    },
    'interview_reminder': {
        'subject': 'Reminder: your Eco-Thrift interview {when}',
        'body': (
            'Hi {first_name},\n\nA reminder: your interview for {roles} is {when} at {place}. Come to the register '
            "and ask for {interviewer}.\n\nCan't make it? Change or cancel here: {link}\n\n" + _SIGN_OFF
        ),
    },
    'interview_notice': {
        'subject': 'Interview {action}: {applicant} ({roles}), {when}',
        'body': (
            '{applicant}: interview {action} for {roles}.\n\nWhen: {when}\nWith: {interviewer}\nPhone: {phone}\n'
            'Email: {email}\n\nOpen in Dash: {dash_link}'
        ),
    },
    # Offers (Phase 3). The letter is what the applicant signs; it is frozen on the offer when sent.
    # Placeholders: {first_name} {full_name} {role} {pay_rate} {employment_type} {start_date} {start_time}
    # {schedule} {supervisor} {respond_by} {note} {offer_date} {signer_name} {signer_title}; the emails also
    # have {link}; the staff notice has {applicant} {action} {reason} {dash_link}.
    'offer_letter': {
        'subject': 'Offer of employment: {role}',
        'body': (
            'Dear {first_name},\n\n'
            "We're excited to offer you the position of {role} at Eco-Thrift. Here are the details:\n\n"
            '- Position: {role}\n'
            '- Pay: ${pay_rate} an hour\n'
            '- Type: {employment_type}\n'
            '- Start: {start_date} at {start_time}\n'
            '- Schedule: {schedule}\n'
            '- Where: our Canfield store, 8425 West Center Road, Omaha, NE 68124\n'
            "- You'll report to: {supervisor}\n\n"
            '{note}\n\n'
            'This offer depends on you completing Form I-9 by your first day: showing original documents that '
            "prove who you are and that you're allowed to work in the United States.\n\n"
            'Your job with Eco-Thrift is at will. That means you or Eco-Thrift can end it at any time, with or '
            'without a reason or notice. This letter is not a promise of a job for any set length of time.\n\n'
            'Please sign by {respond_by}. Questions? Reply to the email this came with, or call the store.\n\n'
            "We're a small team with a big dream, and we're glad you're joining us.\n\n"
            '{signer_name}\n{signer_title}'
        ),
    },
    'offer_sent': {
        'subject': 'Your job offer from Eco-Thrift',
        'body': (
            "Hi {first_name},\n\nWe'd like you to join us as {role}. Read your offer and sign it on your phone "
            "here:\n\n{link}\n\nPlease sign by {respond_by}. If anything in it doesn't look right, reply to this "
            'email before you sign.\n\n' + _SIGN_OFF
        ),
    },
    'offer_signed': {
        'subject': 'Welcome to Eco-Thrift, {first_name}',
        'body': (
            "Hi {first_name},\n\nThanks for signing. Your signed offer is attached. We'll see you on {start_date} "
            'at {start_time}.\n\nBefore your first day, look for an email about what to bring and what to expect. '
            'On day one, bring the documents for your Form I-9.\n\n' + _SIGN_OFF
        ),
    },
    'offer_notice': {
        'subject': 'Offer {action}: {applicant} ({role})',
        'body': (
            '{applicant} {action} the offer for {role}.\n\nPay: ${pay_rate} an hour\nStart: {start_date} at '
            '{start_time}\n{reason}\n\nOpen in Dash: {dash_link}'
        ),
    },
    # Onboarding (Phase 4), sent by Start onboarding. Placeholders: {first_name} {role} {start_date}
    # {start_time} {supervisor} {place}.
    'first_day': {
        'subject': 'Your first day at Eco-Thrift: {start_date}',
        'body': (
            "Hi {first_name},\n\nWe're looking forward to your first day as {role}: {start_date} at {start_time}.\n\n"
            'Where: {place}. Park in the store lot and come in the front door. Ask for {supervisor} at the '
            'register.\n\n'
            "What to wear: comfortable clothes you can lift and move in, and closed-toe shoes. We'll give you "
            'Eco-Thrift T-shirts.\n\n'
            'What to bring: original documents for your Form I-9. Photocopies and pictures on a phone '
            "can't be accepted. Bring either:\n"
            '- one document from List A, such as a U.S. passport or a permanent resident card, or\n'
            "- one from List B, such as a driver's license or a state ID, and one from List C, such as a Social "
            'Security card or a birth certificate.\n\n'
            'The full list: uscis.gov/i-9-central/form-i-9-acceptable-documents\n\n'
            "Also bring your phone. We'll get you signed in to Dash, where you'll see your schedule and your "
            'hours.\n\nQuestions before then? Reply to this email or call the store.\n\n' + _SIGN_OFF
        ),
    },
}

DEFAULT_OFFER = {
    'respond_days': 3,
    'signer_name': 'Bill Rollins',
    'signer_title': 'Owner, Eco-Thrift',
    # From the 2024 job descriptions' acknowledgment block; each must be ticked to sign.
    'acknowledgments': [
        'I can get to 8425 West Center Road for every scheduled shift.',
        "I'm comfortable with the pay and schedule in this offer.",
        'I can do the duties described for this role.',
        'I can meet the physical requirements for this role, with or without accommodation.',
    ],
    'consent': (
        'I agree to sign this offer electronically. My typed name and the signature I draw are my legal '
        'signature, the same as signing on paper. I can download a copy after I sign. If I would rather sign on '
        'paper, I can reply to the email and ask.'
    ),
}

# Onboarding (Phase 4): the checklist every new hire gets. Each item:
#   owner  who does it: new_hire, manager or owner
#   due    before_day1, day1, i9 (3 business days after the start), week1, day20 (Nebraska new-hire report)
#   kind   tick; count (how many and what size); i9 (the I-9 files, Admin only); handbook (signed in Dash);
#          auto (Dash marks it done itself; see ONBOARDING_AUTO)
ONBOARDING_OWNERS = ('new_hire', 'manager', 'owner')
ONBOARDING_DUES = ('before_day1', 'day1', 'i9', 'week1', 'day20')
ONBOARDING_KINDS = ('tick', 'count', 'i9', 'handbook', 'auto')
ONBOARDING_AUTO = ('emergency_contact', 'dash_login', 'first_clock_in', 'schedule', 'kiosk_badge')

DEFAULT_ONBOARDING = {
    'items': [
        {'key': 'quickbooks_added', 'label': 'Added in QuickBooks Payroll (name, phone, email)', 'owner': 'owner',
         'due': 'before_day1', 'kind': 'tick',
         'help': 'QuickBooks then emails them the W-4 and the direct deposit setup.'},
        {'key': 'schedule', 'label': 'On the schedule for their first two weeks', 'owner': 'manager',
         'due': 'before_day1', 'kind': 'auto', 'auto': 'schedule'},
        {'key': 'i9_section1', 'label': 'Form I-9 Section 1 filled in (on paper)', 'owner': 'new_hire', 'due': 'day1',
         'kind': 'tick', 'help': 'By the end of the first day. They fill it in themselves.'},
        {'key': 'i9_section2', 'label': 'Form I-9 Section 2: original documents seen in person, form and copies '
         'uploaded', 'owner': 'owner', 'due': 'i9', 'kind': 'i9',
         'help': 'Within 3 business days of the start. Kept apart from the employee record, Admin only.'},
        {'key': 'quickbooks_setup', 'label': 'QuickBooks setup finished (W-4 and direct deposit)', 'owner': 'new_hire',
         'due': 'day1', 'kind': 'tick', 'help': 'From the QuickBooks email. Bank numbers never go in Dash.'},
        {'key': 'emergency_contact', 'label': 'Emergency contact (ICE) on their profile', 'owner': 'new_hire',
         'due': 'day1', 'kind': 'auto', 'auto': 'emergency_contact'},
        {'key': 'dash_login', 'label': 'Signed in to Dash on their own phone', 'owner': 'new_hire', 'due': 'day1',
         'kind': 'auto', 'auto': 'dash_login', 'help': 'Show them the Set password code on day one.'},
        {'key': 'handbook', 'label': 'Handbook read and signed', 'owner': 'new_hire', 'due': 'day1',
         'kind': 'handbook'},
        {'key': 'time_clock', 'label': 'Time clock explained', 'owner': 'manager', 'due': 'day1', 'kind': 'tick'},
        {'key': 'kiosk_badge', 'label': 'Kiosk badge issued', 'owner': 'manager', 'due': 'day1', 'kind': 'auto',
         'auto': 'kiosk_badge'},
        {'key': 'first_clock_in', 'label': 'First clock-in', 'owner': 'new_hire', 'due': 'day1', 'kind': 'auto',
         'auto': 'first_clock_in'},
        {'key': 'team_intro', 'label': 'Introduced to the team', 'owner': 'manager', 'due': 'day1', 'kind': 'tick'},
        {'key': 'shirts', 'label': 'T-shirts given', 'owner': 'manager', 'due': 'day1', 'kind': 'count',
         'help': 'How many, and what size.'},
        {'key': 'trained', 'label': 'Trained with their manager', 'owner': 'manager', 'due': 'week1', 'kind': 'tick'},
        {'key': 'new_hire_report', 'label': 'Nebraska new-hire report filed', 'owner': 'owner', 'due': 'day20',
         'kind': 'tick', 'help': 'Within 20 days of hire. Tick it when QuickBooks has filed it, or file it yourself.'},
    ],
}

# Check-ins (Phase 5): made when onboarding starts, one per day in ``days`` after the start, assigned to the manager.
# Filled in an in-person meeting on one phone or tablet, signed by both with a finger. The form is copied onto each
# check-in when it is first saved, so a later edit here never changes one already started.
CHECKIN_TYPES = ('text', 'long_text')
DEFAULT_CHECKIN = {
    'days': [30, 60, 90],
    # These check-ins also decide pay: a raise (new rate, from a date) or no change yet, with the reason.
    'pay_review_days': [90],
    'questions': [
        {'key': 'going_well', 'label': 'What is going well?', 'type': 'long_text'},
        {'key': 'training', 'label': 'Where is more training needed?', 'type': 'long_text'},
        {'key': 'goals', 'label': 'Goals for the next 30 days', 'type': 'long_text'},
    ],
    'areas': [
        'Showing up on time, and the time clock',
        'Quality and care in the work',
        'Teamwork and communication',
        'Customers and store rules',
        'Learning the role',
    ],
    'area_ratings': ['Doing well', 'On track', 'Needs work'],
    'employee_statement': (
        'I met with my manager about this check-in. My signature means I saw it and had the chance to comment, '
        'not that I agree with all of it.'
    ),
}

# The staff handbook draft. Publishing makes a numbered version that new hires sign in Dash; it is refused while
# any "[confirm" mark is left (facts the owner still has to settle). The attorney reads it before the first signature.
HANDBOOK_CONFIRM = '[confirm'
DEFAULT_HANDBOOK = {
    'title': 'Eco-Thrift staff handbook',
    'text': (
        '## Welcome\n'
        'Welcome to Eco-Thrift. Our mission: another chance for everything and everyone. We are a small team with a '
        'big dream, and we hire people who are proactive and give 100%. This handbook is short on purpose. If '
        "something isn't covered, ask your manager or Bill.\n\n"
        '## Your job is at will\n'
        'You or Eco-Thrift can end your job at any time, with or without a reason or notice. Nothing in this '
        'handbook is a contract or a promise of a job for any length of time. Eco-Thrift may change this handbook '
        'and will tell you when it does.\n\n'
        '## Hours and the time clock\n'
        '- Your schedule is in Dash. Check it every week.\n'
        '- Clock in at the kiosk when you start working and clock out when you stop, including for meal breaks. '
        'Clock in no more than 5 minutes before your shift, and out no more than 5 minutes after it.\n'
        '- Never work off the clock, and never clock in or out for someone else.\n'
        '- Forgot, or made a mistake? Send a time change request in Dash the same day.\n'
        '- Work the hours you are scheduled, unless your manager asks you to stay. All time worked is paid.\n\n'
        '## Breaks\n'
        'Shifts of 6 hours or more include an unpaid 30-minute meal break; clock out for it. Rest breaks of 10 '
        'minutes or less are paid: one for every 4 hours, when the floor is covered.\n\n'
        "## Running late, or can't come in\n"
        "Call or text your manager at least 2 hours before your shift. A message to a coworker doesn't count. "
        'Missing a shift without telling anyone (a no-call, no-show) twice can end your job.\n\n'
        '## Pay\n'
        '- Pay periods are two weeks, Monday through the second Sunday.\n'
        '- You are paid by direct deposit through QuickBooks Payroll. Payroll goes in after each pay period ends, '
        'and the money usually lands that Thursday or Friday. Holidays can move it.\n'
        '- Hours over 40 in a week (Monday to Sunday) are paid at time and a half. Get your manager\'s OK before '
        'working them.\n'
        '- Your hours and pay are in Dash. If something looks wrong, tell Bill right away.\n'
        '- When your job ends, your final pay comes on the next regular payday or within two weeks, whichever is '
        'sooner.\n\n'
        '## Time off\n'
        '- Ask your manager for time off at least two weeks ahead.\n'
        "- Eco-Thrift doesn't offer paid vacation or paid holidays. The store may be open on holidays, and holiday "
        'shifts are shared.\n'
        '- Sick days are unpaid for now. Tell your manager as early as you can. Paid sick leave, under Nebraska\'s '
        'paid sick leave rules, starts at the beginning of 2027.\n\n'
        '## What to wear\n'
        '- An Eco-Thrift T-shirt on every shift. We give you two.\n'
        '- Closed-toe shoes, and clothes you can lift and move in.\n\n'
        '## Phones\n'
        'Keep your personal phone put away on the floor, except to use Dash or to call for help. Use it freely on '
        'breaks.\n\n'
        '## Shopping at Eco-Thrift\n'
        '- There is no staff discount. Instead, staff get a free Thrift+ membership with no monthly cover.\n'
        '- You can pay by payroll deduction: the whole amount comes out of your next paycheck, never spread over '
        'more than one, and never more than 25% of your last paycheck.\n'
        '- Someone else rings up your purchase. Never ring your own sale.\n'
        '- An item must be out on the floor for customers for at least one full day before staff may buy it. '
        "Don't hold or set items aside for yourself or friends without Bill's OK.\n\n"
        '## Thrift+ and IDs\n'
        "- You may look at a customer's ID to confirm their name and that they are 18 or older. Never scan, copy or "
        'photograph an ID, and never type ID numbers, birth dates or addresses into Dash, notes included.\n'
        '- For an 18+ item, check that the photo on screen matches the person at the counter. If you are not sure, '
        'ask for ID. 18+ items stay behind the counter.\n\n'
        '## Safety\n'
        '- Lift with your legs, and get help with anything heavy or awkward. Use the carts and dollies.\n'
        '- Keep aisles and exits clear.\n'
        '- Report any injury, even a small one, to Bill the same day.\n'
        '- No smoking or vaping inside, or within 25 feet of the doors.\n\n'
        '## Conduct\n'
        "- No alcohol or drugs at work, and don't come to work impaired. Tell your manager if a medicine could "
        'affect your work.\n'
        '- Theft, violence or threats end your job.\n'
        "- Keep the store's numbers, customer details and what's in Dash private. Talking about your own pay and "
        'working conditions is always OK.\n\n'
        '## Respect, and how to report a problem\n'
        "Eco-Thrift doesn't allow harassment or discrimination of any kind, by anyone: staff, customers or vendors. "
        'If something happens to you, or you see it, tell your manager (the lead of your area). Your manager '
        'decides whether it needs to go higher, and lets Bill know when it does. If the problem is with your '
        "manager, or you'd rather not go to them, tell Bill directly. You won't be punished for reporting in good "
        'faith, and every report is looked into.\n\n'
        '## Leaving\n'
        'Please give at least two weeks of notice if you can (four weeks for a lead), and hand in your kiosk badge on '
        'your last day.'
    ),
    'acknowledgment': (
        'I have read this handbook. I understand it is not a contract, that my job is at will, and that Eco-Thrift '
        'may change the handbook and will tell me when it does.'
    ),
}

# Texts (Phase 6), for applicants who ticked the text box. Each starts with "Eco-Thrift:" and keeps a STOP line
# (house standard texting.md); at most 320 characters (two texts). Until texting is live they are held, not sent.
TEXT_KEYS = ('interview_booked', 'interview_changed', 'interview_cancelled', 'interview_reminder', 'first_day')
TEXT_MAX = 320
# The first text after the tick: the 10DLC campaign's sample, word for word, so it is not editable.
OPT_IN_TEXT = (
    "Eco-Thrift: You'll get texts about your job application. Msg frequency varies. Msg & data rates may apply. "
    'Reply HELP for help, STOP to cancel.'
)
DEFAULT_TEXTS = {
    'place': '8425 W Center Rd',
    'interview_booked': (
        'Eco-Thrift: Your interview for {role} is {when} at {place}. Need to change it? {link} Reply STOP to opt out.'
    ),
    'interview_changed': (
        'Eco-Thrift: Your interview moved to {when} at {place}. Need to change it? {link} Reply STOP to opt out.'
    ),
    'interview_cancelled': (
        'Eco-Thrift: Your interview on {when} is cancelled. Pick a new time: {link} Reply STOP to opt out.'
    ),
    'interview_reminder': (
        'Eco-Thrift: Reminder: your interview is tomorrow, {when}, at {place}. Ask at the register. '
        'Change it: {link} Reply STOP to opt out.'
    ),
    'first_day': (
        'Eco-Thrift: See you tomorrow, {first_name}! Your first day starts at {start_time} at {place}. '
        'Ask for {supervisor} at the register. Reply STOP to opt out.'
    ),
}

# Which days and times are open lives on People -> Interviews (InterviewTime rows), not here.
DEFAULT_INTERVIEWS = {
    'length_minutes': 30,
    'min_notice_hours': 12,
    'link_days': 14,
    'place': 'our Canfield store, 8425 West Center Road, Omaha',
}

# New roles start with these (staff emails); every role can change them.
DEFAULT_ROLE_PEOPLE = {'hiring_manager': '', 'interviewers': []}

DEFAULT_SETTING = {
    'public': False,
    'page': DEFAULT_PAGE,
    'form': {'questions': DEFAULT_QUESTIONS},
    'email': DEFAULT_EMAIL,
    'interviews': DEFAULT_INTERVIEWS,
    'defaults': DEFAULT_ROLE_PEOPLE,
    'offer': DEFAULT_OFFER,
    'onboarding': DEFAULT_ONBOARDING,
    'handbook': DEFAULT_HANDBOOK,
    'checkin': DEFAULT_CHECKIN,
    'texts': DEFAULT_TEXTS,
}

JOB_FIELDS = (
    'slug', 'title', 'tagline', 'summary', 'duties', 'success', 'looking_for', 'nice_to_have', 'physical', 'works_with',
    'schedule', 'hours', 'employment_type', 'pay_min', 'pay_max', 'pay_text', 'questions', 'interview_questions', 'status', 'sort_order',
    'emails',
)
# Links to other records, written by key (department slug, staff email) so a file stays readable.
JOB_LINKS = ('department', 'hiring_manager', 'interviewers')

BUNDLE_FORMAT = 'ecothrift.careers-bundle/1'


# ── Stored setting ──────────────────────────────────────────────────────────


def load_setting() -> dict:
    """The stored careers setting merged over the defaults (missing keys fall back)."""
    row = AppSetting.objects.filter(key=SETTING_KEY).first()
    stored = row.value if row and isinstance(row.value, dict) else {}
    merged = copy.deepcopy(DEFAULT_SETTING)
    for key in ('public', 'page', 'form', 'email', 'interviews', 'defaults', 'offer', 'onboarding', 'handbook',
                'checkin', 'texts', 'preview_key'):
        if key in stored:
            if isinstance(merged.get(key), dict) and isinstance(stored[key], dict):
                merged[key] = {**merged[key], **stored[key]}
            else:
                merged[key] = stored[key]
    if not str(merged['email'].get('from') or '').strip():  # older files: blank meant the store mailbox
        merged['email']['from'] = DEFAULT_EMAIL['from']
    return merged


def preview_key() -> str:
    """A random key that lets the owner see the public pages while they are off."""
    setting = load_setting()
    key = setting.get('preview_key') or ''
    if not key:
        key = secrets.token_urlsafe(12)
        _save_setting({**setting, 'preview_key': key}, user=None)
    return key


def _save_setting(value: dict, *, user) -> None:
    row = AppSetting.objects.filter(key=SETTING_KEY).first()
    old = row.value if row else None
    if row is None:
        AppSetting.objects.create(
            key=SETTING_KEY, value=value, description='Hiring: careers page, form, emails', updated_by=user,
        )
    else:
        row.value = value
        row.updated_by = user
        row.save(update_fields=['value', 'updated_by', 'updated_at'])
    AppSettingHistory.objects.create(key=SETTING_KEY, old_value=old, new_value=value, changed_by=user)


def set_public(on: bool, *, user) -> dict:
    setting = load_setting()
    setting['public'] = bool(on)
    _save_setting(setting, user=user)
    return setting


def is_public() -> bool:
    return bool(load_setting().get('public'))


# ── Export ──────────────────────────────────────────────────────────────────


def _money(value) -> float | None:
    return float(value) if value is not None else None


def job_to_doc(job) -> dict:
    return {
        'slug': job.slug,
        'title': job.title,
        'status': job.status,
        'tagline': job.tagline,
        'summary': job.summary,
        'duties': list(job.duties or []),
        'success': list(job.success or []),
        'looking_for': list(job.looking_for or []),
        'nice_to_have': list(job.nice_to_have or []),
        'physical': list(job.physical or []),
        'works_with': job.works_with,
        'schedule': job.schedule,
        'hours': job.hours,
        'employment_type': job.employment_type,
        'pay_min': _money(job.pay_min),
        'pay_max': _money(job.pay_max),
        'pay_text': job.pay_text,
        'questions': list(job.questions or []),
        'interview_questions': list(job.interview_questions or []),
        'sort_order': job.sort_order,
        'emails': dict(job.emails or {}),
        'department': job.department.slug if job.department_id else '',
        'hiring_manager': (job.hiring_manager.email or '').lower() if job.hiring_manager_id else '',
        'interviewers': sorted((u.email or '').lower() for u in job.interviewers.all()),
    }


def export_doc() -> dict:
    from apps.hiring.models import Job

    setting = load_setting()
    jobs = Job.objects.select_related('department', 'hiring_manager').prefetch_related('interviewers')
    return {
        'format': FORMAT,
        'public': bool(setting.get('public')),
        'page': setting['page'],
        'form': setting['form'],
        'email': setting['email'],
        'interviews': setting['interviews'],
        'defaults': setting['defaults'],
        'offer': setting['offer'],
        'onboarding': setting['onboarding'],
        'handbook': setting['handbook'],
        'checkin': setting['checkin'],
        'texts': setting['texts'],
        'jobs': [job_to_doc(job) for job in jobs],
    }


# ── Indexes and the AI bundle ───────────────────────────────────────────────


STAFF_GROUPS = ('Admin', 'Manager', 'Employee')


def staff_users():
    """Active people with a staff role (or the staff flag): who can own hiring for a role or interview."""
    from django.db.models import Q

    from apps.accounts.models import User

    return (User.objects.filter(is_active=True).exclude(email='')
            .filter(Q(is_staff=True) | Q(groups__name__in=STAFF_GROUPS)).distinct())


def staff_index() -> list[dict]:
    """People who can be a hiring manager or an interviewer: active staff, by email."""
    users = staff_users().prefetch_related('groups').order_by('first_name', 'last_name', 'email')
    out = []
    for user in users:
        roles = [g.name for g in user.groups.all() if g.name in STAFF_GROUPS]
        out.append({
            'id': user.pk,
            'email': user.email.lower(),
            'name': (user.full_name or '').strip() or user.email,
            'role': roles[0] if roles else ('Admin' if user.is_superuser else 'Staff'),
        })
    return out


def department_index() -> list[dict]:
    from apps.hr.models import Department

    return [{'id': d.pk, 'slug': d.slug, 'name': d.name} for d in Department.objects.order_by('name')]


def indexes() -> dict:
    """Every key a careers file may point at, so an AI (or a person) never has to guess."""
    from apps.hiring.models import Application

    return {
        'staff': staff_index(),
        'departments': department_index(),
        'question_types': list(QUESTION_TYPES),
        'job_statuses': list(JOB_STATUSES),
        'employment_types': list(JOB_TYPES),
        'not_now_emails': list(NOT_NOW_KEYS),
        'not_now_reasons': [{'key': k, 'label': l} for k, l in Application.NOT_NOW_REASONS],
        'stages': [{'key': k, 'label': l} for k, l in Application.STAGE_CHOICES],
        'email_placeholders': {
            'all emails': ['{first_name}', '{last_name}', '{roles}', '{phone}', '{email}', '{review_day}',
                           '{reply_days}'],
            'alert only': ['{flags}', '{dash_link}'],
            'interview emails': ['{when}', '{place}', '{interviewer}', '{link}', '{link_days}', '{length}'],
            'interview_notice only': ['{applicant}', '{action}', '{dash_link}'],
            'offer letter and offer emails': ['{first_name}', '{full_name}', '{role}', '{pay_rate}',
                                              '{employment_type}', '{start_date}', '{start_time}', '{schedule}',
                                              '{supervisor}', '{respond_by}', '{note}', '{offer_date}',
                                              '{signer_name}', '{signer_title}', '{link}'],
            'offer_notice only': ['{applicant}', '{action}', '{reason}', '{dash_link}'],
            'first_day': ['{first_name}', '{role}', '{start_date}', '{start_time}', '{supervisor}', '{place}'],
        },
        'text_placeholders': {
            'interview texts': ['{first_name}', '{role}', '{when}', '{place}', '{link}'],
            'first_day text': ['{first_name}', '{role}', '{start_date}', '{start_time}', '{supervisor}', '{place}'],
        },
        'onboarding_owners': list(ONBOARDING_OWNERS),
        'onboarding_dues': list(ONBOARDING_DUES),
        'onboarding_kinds': list(ONBOARDING_KINDS),
        'onboarding_auto': list(ONBOARDING_AUTO),
        'never_ask': NEVER_ASK,
        'mailboxes': list(MAILBOXES),
        'email_templates': list(TEMPLATE_KEYS),
    }


def bundle(instructions: str) -> dict:
    """The download for AI: instructions, the indexes, and the current file, in one JSON."""
    from django.utils import timezone

    return {
        'format': BUNDLE_FORMAT,
        'exported_at': timezone.localtime().isoformat(timespec='seconds'),
        'instructions': instructions,
        'how_to_return': (
            'Return this whole JSON object with your changes made inside "careers" (or return only the '
            '"careers" object). Keep every key. Use only values listed in "indexes": staff emails for '
            'hiring_manager and interviewers, department slugs, question types, job statuses.'
        ),
        'indexes': indexes(),
        'careers': export_doc(),
    }


# ── Check (validate + normalize) ────────────────────────────────────────────


def _text(value, *, limit: int = 0) -> str:
    out = '' if value is None else str(value).strip()
    return out[:limit] if limit else out


def _check_questions(raw, where: str, errors: list[str], warnings: list[str]) -> list[dict]:
    if raw in (None, ''):
        return []
    if not isinstance(raw, list):
        errors.append(f'{where}: questions must be a list.')
        return []
    out, seen = [], set()
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            errors.append(f'{where} question {index}: must be an object with key, label and type.')
            continue
        label = _text(item.get('label'), limit=300)
        key = _text(item.get('key')) or slugify(label).replace('-', '_')[:40]
        key = re.sub(r'[^a-z0-9_]', '_', key.lower())[:40]
        qtype = _text(item.get('type')) or 'text'
        if not label:
            errors.append(f'{where} question {index}: label is missing.')
            continue
        if qtype not in QUESTION_TYPES:
            errors.append(f'{where} "{label}": type must be one of {", ".join(QUESTION_TYPES)}.')
            continue
        if key in seen:
            errors.append(f'{where}: the key "{key}" is used twice.')
            continue
        seen.add(key)
        question = {'key': key, 'label': label, 'type': qtype, 'required': bool(item.get('required', False))}
        if qtype in ('choice', 'multi'):
            options = [_text(o, limit=120) for o in (item.get('options') or []) if _text(o)]
            if not options:
                errors.append(f'{where} "{label}": a {qtype} question needs options.')
                continue
            question['options'] = options
        must_be = _text(item.get('must_be')).lower()
        if must_be:
            if qtype != 'yes_no' or must_be not in ('yes', 'no'):
                errors.append(f'{where} "{label}": must_be works only on yes_no questions, as yes or no.')
                continue
            question['must_be'] = must_be
            question['flag_label'] = _text(item.get('flag_label'), limit=40) or label[:40]
        if _text(item.get('help')):
            question['help'] = _text(item.get('help'), limit=300)
        if item.get('after_roles'):
            question['after_roles'] = True
        if _NEVER_STORE_WORDS.search(f'{label} {question.get("help", "")}'):
            errors.append(f'{where} "{label}" asks for a number Dash never stores (Social Security, bank, routing, '
                          'or an ID number). Those go on paper or in QuickBooks.')
            continue
        if _NEVER_ASK_WORDS.search(label):
            warnings.append(f'{where} "{label}" may ask something we never ask. Check the never-ask list.')
        out.append(question)
    return out


def _check_money(value, label: str, errors: list[str]) -> float | None:
    if value in (None, ''):
        return None
    try:
        amount = Decimal(str(value).replace('$', '').strip())
    except (InvalidOperation, ValueError):
        errors.append(f'{label} must be a number.')
        return None
    if amount < 0 or amount > 1000:
        errors.append(f'{label} looks wrong ({amount}).')
        return None
    return float(amount)


def _check_links(item: dict, title: str, links: dict, errors: list[str]) -> dict:
    """department (slug or name), hiring_manager (staff email), interviewers (staff emails)."""
    out = {'department': '', 'hiring_manager': '', 'interviewers': []}
    department = _text(item.get('department')).lower()
    if department:
        slug = links['departments'].get(department)
        if slug is None:
            errors.append(f'{title}: department "{department}" is not in indexes.departments.')
        else:
            out['department'] = slug
    manager = _text(item.get('hiring_manager')).lower()
    if manager:
        if manager not in links['staff']:
            errors.append(f'{title}: hiring_manager "{manager}" is not a staff email in indexes.staff.')
        else:
            out['hiring_manager'] = manager
    interviewers = item.get('interviewers') or []
    if isinstance(interviewers, str):
        interviewers = [e for e in interviewers.replace(';', ',').split(',')]
    if not isinstance(interviewers, list):
        errors.append(f'{title}: interviewers must be a list of staff emails.')
        return out
    for email in interviewers:
        email = _text(email).lower()
        if not email:
            continue
        if email not in links['staff']:
            errors.append(f'{title}: interviewer "{email}" is not a staff email in indexes.staff.')
        elif email not in out['interviewers']:
            out['interviewers'].append(email)
    out['interviewers'].sort()
    return out


def _check_job(item, index: int, errors: list[str], warnings: list[str], *, links: dict,
               current_jobs: dict) -> dict | None:
    if not isinstance(item, dict):
        errors.append(f'Job {index}: must be an object.')
        return None
    raw_slug = slugify(_text(item.get('slug')) or _text(item.get('title')))[:60]
    # A key the file leaves out keeps today's value, as for the rest of the careers file.
    item = {**current_jobs.get(raw_slug, {}), **item}
    title = _text(item.get('title'), limit=120)
    if not title:
        errors.append(f'Job {index}: title is missing.')
        return None
    slug = slugify(_text(item.get('slug')) or title)[:60]
    status = _text(item.get('status')) or 'draft'
    if status not in JOB_STATUSES:
        errors.append(f'{title}: status must be one of {", ".join(JOB_STATUSES)}.')
        return None
    employment_type = _text(item.get('employment_type')) or 'full_or_part'
    if employment_type not in JOB_TYPES:
        errors.append(f'{title}: employment_type must be one of {", ".join(JOB_TYPES)}.')
        return None
    lists = {}
    for key in ('duties', 'success', 'looking_for', 'nice_to_have', 'physical'):
        value = item.get(key) or []
        if isinstance(value, str):
            value = [line.strip('-• ').strip() for line in value.splitlines() if line.strip()]
        if not isinstance(value, list):
            errors.append(f'{title}: {key} must be a list.')
            return None
        lists[key] = [_text(v, limit=300) for v in value if _text(v)]
    pay_min = _check_money(item.get('pay_min'), f'{title} pay_min', errors)
    pay_max = _check_money(item.get('pay_max'), f'{title} pay_max', errors)
    if pay_min is not None and pay_max is not None and pay_max < pay_min:
        errors.append(f'{title}: pay_max is below pay_min.')
    try:
        sort_order = max(0, min(999, int(item.get('sort_order') or index * 10)))
    except (TypeError, ValueError):
        sort_order = index * 10
    return {
        'slug': slug,
        'title': title,
        'status': status,
        'tagline': _text(item.get('tagline'), limit=200),
        'summary': _text(item.get('summary'), limit=4000),
        **lists,
        'works_with': _text(item.get('works_with'), limit=200),
        'schedule': _text(item.get('schedule'), limit=200),
        'hours': _text(item.get('hours'), limit=120),
        'employment_type': employment_type,
        'pay_min': pay_min,
        'pay_max': pay_max,
        'pay_text': _text(item.get('pay_text'), limit=200),
        'questions': _check_questions(item.get('questions'), title, errors, warnings),
        'interview_questions': _check_questions(item.get('interview_questions'), f'{title} interview', errors, warnings),
        'sort_order': sort_order,
        'emails': _check_role_emails(item.get('emails'), title, errors),
        **_check_links(item, title, links, errors),
    }


def _check_role_emails(raw, title: str, errors: list[str]) -> dict:
    """A role's own versions of emails: {template key: {subject, body}}. Keys from indexes.email_templates."""
    if raw in (None, ''):
        return {}
    if not isinstance(raw, dict):
        errors.append(f'{title}: emails must be an object of template key → {{subject, body}}.')
        return {}
    out = {}
    for key, block in raw.items():
        if key not in TEMPLATE_KEYS:
            errors.append(f'{title}: "{key}" is not an email template (see indexes.email_templates).')
            continue
        if block in (None, '', {}):
            continue  # empty = use the universal email
        out[key] = _check_email_block(block, f'{title} emails.{key}', errors)
    return out


def _check_email_block(raw, label: str, errors: list[str]) -> dict:
    if not isinstance(raw, dict):
        errors.append(f'{label} must have subject and body.')
        return {'subject': '', 'body': ''}
    subject, body = _text(raw.get('subject'), limit=200), _text(raw.get('body'), limit=6000)
    if not subject or not body:
        errors.append(f'{label} needs both a subject and a body.')
    return {'subject': subject, 'body': body}


def _check_mailboxes(raw, label: str, errors: list[str], *, many: bool = False) -> str:
    """One of MAILBOXES (``many``: a comma list of them). "Eco-Thrift <retail@…>" is fine; blank is blank."""
    from email.utils import getaddresses

    picked = []
    for _, address in getaddresses([str(raw or '').replace(';', ',')]):
        address = address.strip().lower()
        if not address or address in picked:
            continue
        if address not in MAILBOXES:
            errors.append(f'{label}: {address} is not a store mailbox (use {", ".join(MAILBOXES)}).')
            continue
        picked.append(address)
    if not many and len(picked) > 1:
        errors.append(f'{label} takes one address.')
    return ', '.join(picked if many else picked[:1])


def _check_interviews(raw, current: dict, errors: list[str]) -> dict:
    """Interview length and booking rules. Keys left out keep today's values; the old weekly-hours keys are dropped."""
    out = {key: (current or {}).get(key, value) for key, value in DEFAULT_INTERVIEWS.items()}
    if raw is None:
        return out
    if not isinstance(raw, dict):
        errors.append('interviews must be an object.')
        return out
    for key, low, high in (('length_minutes', 10, 180), ('min_notice_hours', 0, 168),
                           ('link_days', 1, 60)):
        if key in raw:
            try:
                value = int(raw.get(key))
            except (TypeError, ValueError):
                errors.append(f'interviews.{key} must be a whole number.')
                continue
            if not low <= value <= high:
                errors.append(f'interviews.{key} must be between {low} and {high}.')
            else:
                out[key] = value
    if 'place' in raw:
        out['place'] = _text(raw.get('place'), limit=200) or DEFAULT_INTERVIEWS['place']
    return out


def _check_offer(raw, current: dict, errors: list[str]) -> dict:
    """Offer rules: reply-by days, who signs for Eco-Thrift, the acknowledgments, the e-sign consent."""
    out = {**DEFAULT_OFFER, **(current or {})}
    if raw is None:
        return out
    if not isinstance(raw, dict):
        errors.append('offer must be an object.')
        return out
    if 'respond_days' in raw:
        try:
            days = int(raw.get('respond_days'))
            if not 1 <= days <= 30:
                raise ValueError
            out['respond_days'] = days
        except (TypeError, ValueError):
            errors.append('offer.respond_days must be a whole number from 1 to 30.')
    for key in ('signer_name', 'signer_title'):
        if key in raw:
            out[key] = _text(raw.get(key), limit=160)
    if 'acknowledgments' in raw:
        acks = raw.get('acknowledgments') or []
        if isinstance(acks, str):
            acks = [a.strip('-• ').strip() for a in acks.splitlines()]
        if not isinstance(acks, list):
            errors.append('offer.acknowledgments must be a list of sentences.')
        else:
            out['acknowledgments'] = [_text(a, limit=300) for a in acks if _text(a)][:10]
    if 'consent' in raw:
        consent = _text(raw.get('consent'), limit=1000)
        if not consent:
            errors.append('offer.consent (the e-sign agreement) cannot be empty.')
        else:
            out['consent'] = consent
    return out


def _check_onboarding(raw, current: dict, errors: list[str]) -> dict:
    """The onboarding checklist: key, label, help, owner, due, kind (and auto for kind auto)."""
    out = {**DEFAULT_ONBOARDING, **(current or {})}
    if raw is None:
        return out
    if not isinstance(raw, dict) or not isinstance(raw.get('items', out['items']), list):
        errors.append('onboarding must be an object with an items list.')
        return out
    items, seen = [], set()
    for index, item in enumerate(raw.get('items', out['items']), start=1):
        if not isinstance(item, dict):
            errors.append(f'onboarding item {index}: must be an object (key, label, owner, due, kind).')
            continue
        label = _text(item.get('label'), limit=200)
        key = slugify(_text(item.get('key')) or label).replace('-', '_')[:40]
        where = f'onboarding item {index} ({label or key or "?"})'
        if not label or not key:
            errors.append(f'{where}: needs a label.')
            continue
        if key in seen:
            errors.append(f'{where}: two items share the key "{key}".')
            continue
        seen.add(key)
        owner, due, kind = (_text(item.get(f)) for f in ('owner', 'due', 'kind'))
        if owner not in ONBOARDING_OWNERS:
            errors.append(f'{where}: owner must be one of {", ".join(ONBOARDING_OWNERS)}.')
        if due not in ONBOARDING_DUES:
            errors.append(f'{where}: due must be one of {", ".join(ONBOARDING_DUES)}.')
        if kind not in ONBOARDING_KINDS:
            errors.append(f'{where}: kind must be one of {", ".join(ONBOARDING_KINDS)}.')
        entry = {'key': key, 'label': label, 'owner': owner, 'due': due, 'kind': kind}
        if kind == 'auto':
            auto = _text(item.get('auto'))
            if auto not in ONBOARDING_AUTO:
                errors.append(f'{where}: auto must be one of {", ".join(ONBOARDING_AUTO)}.')
            entry['auto'] = auto
        if _text(item.get('help')):
            entry['help'] = _text(item.get('help'), limit=400)
        items.append(entry)
    if not items:
        errors.append('onboarding needs at least one item.')
    out['items'] = items
    return out


def _check_handbook(raw, current: dict, errors: list[str]) -> dict:
    """The handbook draft (title, text, acknowledgment). Publishing it is a separate step in Dash."""
    out = {**DEFAULT_HANDBOOK, **(current or {})}
    if raw is None:
        return out
    if not isinstance(raw, dict):
        errors.append('handbook must be an object (title, text, acknowledgment).')
        return out
    for key, limit in (('title', 160), ('text', 30000), ('acknowledgment', 1000)):
        if key in raw:
            value = _text(raw.get(key), limit=limit)
            if not value:
                errors.append(f'handbook.{key} cannot be empty.')
            else:
                out[key] = value
    return out


def _check_checkin(raw, current: dict, errors: list[str]) -> dict:
    """The check-in form: days after the start, questions (text or long_text), areas and their ratings."""
    out = {**DEFAULT_CHECKIN, **(current or {})}
    if raw is None:
        return out
    if not isinstance(raw, dict):
        errors.append('checkin must be an object (days, pay_review_days, questions, areas, area_ratings, '
                      'employee_statement).')
        return out
    if 'days' in raw:
        try:
            days = sorted({int(d) for d in raw.get('days') or []})
            if not days or len(days) > 6 or days[0] < 7 or days[-1] > 365:
                raise ValueError
            out['days'] = days
        except (TypeError, ValueError):
            errors.append('checkin.days must be 1 to 6 whole numbers of days, from 7 to 365.')
    if 'pay_review_days' in raw:
        try:
            out['pay_review_days'] = sorted({int(d) for d in raw.get('pay_review_days') or []})
        except (TypeError, ValueError):
            errors.append('checkin.pay_review_days must be whole numbers of days from checkin.days (e.g. [90]).')
    stray = [d for d in out.get('pay_review_days', []) if d not in out['days']]
    if stray:
        errors.append(f'checkin.pay_review_days: {", ".join(map(str, stray))} is not one of checkin.days.')
    if 'questions' in raw:
        items, seen = [], set()
        for index, item in enumerate(raw.get('questions') or [], start=1):
            if not isinstance(item, dict) or not _text(item.get('label')):
                errors.append(f'checkin question {index}: needs a label.')
                continue
            key = slugify(_text(item.get('key')) or _text(item.get('label'))).replace('-', '_')[:40]
            kind = _text(item.get('type')) or 'long_text'
            if kind not in CHECKIN_TYPES:
                errors.append(f'checkin question {index}: type must be text or long_text.')
            if key in seen:
                errors.append(f'checkin question {index}: two questions share the key "{key}".')
                continue
            seen.add(key)
            items.append({'key': key, 'label': _text(item.get('label'), limit=200), 'type': kind})
        out['questions'] = items
    for key, limit in (('areas', 10), ('area_ratings', 5)):
        if key in raw:
            values = raw.get(key) or []
            if isinstance(values, str):
                values = [v.strip('-• ').strip() for v in values.splitlines()]
            values = [_text(v, limit=120) for v in values if _text(v)]
            if key == 'area_ratings' and len(values) < 2:
                errors.append('checkin.area_ratings needs at least 2 choices.')
            out[key] = values[:limit]
    if 'employee_statement' in raw:
        statement = _text(raw.get('employee_statement'), limit=600)
        if not statement:
            errors.append('checkin.employee_statement cannot be empty.')
        else:
            out['employee_statement'] = statement
    if not out['questions'] and not out['areas']:
        errors.append('The check-in needs at least one question or area.')
    return out


def _check_texts(raw, current: dict, errors: list[str]) -> dict:
    """The applicant texts: each starts with "Eco-Thrift:", keeps a STOP line, and fits in two texts."""
    out = {**DEFAULT_TEXTS, **(current or {})}
    if raw is None:
        return out
    if not isinstance(raw, dict):
        errors.append('texts must be an object (place and one line per text).')
        return out
    if 'place' in raw:
        place = _text(raw.get('place'), limit=80)
        if not place:
            errors.append('texts.place cannot be empty (a short address, like 8425 W Center Rd).')
        else:
            out['place'] = place
    for key in TEXT_KEYS:
        if key not in raw:
            continue
        text = ' '.join(_text(raw.get(key)).split())
        if not text.startswith('Eco-Thrift:'):
            errors.append(f'texts.{key} must start with "Eco-Thrift:" (texts say who sent them).')
        elif not re.search(r'\bSTOP\b', text):
            errors.append(f'texts.{key} must say how to stop, e.g. "Reply STOP to opt out."')
        elif len(text) > TEXT_MAX:
            errors.append(f'texts.{key} is {len(text)} characters; keep it under {TEXT_MAX} (two texts).')
        else:
            out[key] = text
    return out


def check_doc(raw) -> dict:
    """Validate and normalize a careers file. Returns {ok, errors, warnings, doc}."""
    errors: list[str] = []
    warnings: list[str] = []
    if not isinstance(raw, dict):
        return {'ok': False, 'errors': ['The file must be one object (format, page, form, email, jobs).'],
                'warnings': [], 'doc': None}
    if raw.get('format') == BUNDLE_FORMAT or ('careers' in raw and 'jobs' not in raw):
        # The whole download came back: the file is inside "careers"; instructions and indexes are ignored.
        raw = raw.get('careers')
        if not isinstance(raw, dict):
            return {'ok': False, 'errors': ['"careers" must be the careers file (an object).'], 'warnings': [],
                    'doc': None}
    fmt = _text(raw.get('format'))
    if fmt and fmt != FORMAT:
        errors.append(f'format must be "{FORMAT}" (got "{fmt}").')
    elif not fmt:
        warnings.append(f'No format line; read as {FORMAT}.')

    current = load_setting()

    # A file that leaves a key out keeps today's value (not the default), so a short AI answer
    # that only touches one email can't wipe the rest.
    page_raw = raw.get('page', current['page'])
    page = {**DEFAULT_PAGE, **current['page']}
    if isinstance(page_raw, dict):
        for key in DEFAULT_PAGE:
            if key == 'intro':
                intro = page_raw.get('intro', page['intro'])
                if isinstance(intro, str):
                    intro = [p.strip() for p in intro.split('\n\n') if p.strip()]
                page['intro'] = [_text(p, limit=2000) for p in (intro or []) if _text(p)]
            elif key in page_raw:
                page[key] = _text(page_raw.get(key), limit=2000)
    else:
        errors.append('page must be an object.')

    form_raw = raw.get('form', current['form'])
    questions = _check_questions(
        form_raw.get('questions') if isinstance(form_raw, dict) else None, 'Form', errors, warnings,
    )
    if not questions:
        errors.append('The form needs at least one question.')

    email_raw = raw.get('email', current['email'])
    email = copy.deepcopy(current['email'])
    email['not_now'] = {**copy.deepcopy(DEFAULT_EMAIL['not_now']), **(email.get('not_now') or {})}
    if isinstance(email_raw, dict):
        if 'review_day' in email_raw:
            email['review_day'] = _text(email_raw.get('review_day'), limit=200)
        for key in ('from', 'reply_to', 'notify'):
            if key in email_raw:
                email[key] = _check_mailboxes(email_raw.get(key), f'email.{key}', errors, many=key == 'notify')
        if not email.get('from'):
            email['from'] = DEFAULT_EMAIL['from']
        try:
            email['reply_days'] = max(1, min(60, int(email_raw.get('reply_days', email['reply_days']))))
        except (TypeError, ValueError):
            errors.append('email.reply_days must be a whole number of days.')
        for key in EMAIL_KEYS:
            if key in email_raw:
                email[key] = _check_email_block(email_raw[key], f'email.{key}', errors)
        not_now_raw = email_raw.get('not_now')
        if isinstance(not_now_raw, dict):
            for key, block in not_now_raw.items():
                if key not in NOT_NOW_KEYS:
                    warnings.append(f'email.not_now.{key} is not a reason with its own email; ignored.')
                    continue
                email['not_now'][key] = _check_email_block(block, f'email.not_now.{key}', errors)
    else:
        errors.append('email must be an object.')

    interviews = _check_interviews(raw.get('interviews'), current['interviews'], errors)
    offer = _check_offer(raw.get('offer'), current['offer'], errors)
    onboarding = _check_onboarding(raw.get('onboarding'), current['onboarding'], errors)
    handbook = _check_handbook(raw.get('handbook'), current['handbook'], errors)
    checkin = _check_checkin(raw.get('checkin'), current['checkin'], errors)
    texts = _check_texts(raw.get('texts'), current['texts'], errors)
    links = {
        'staff': {s['email'] for s in staff_index()},
        'departments': {
            **{d['slug'].lower(): d['slug'] for d in department_index()},
            **{d['name'].lower(): d['slug'] for d in department_index()},
        },
    }
    defaults_raw = raw.get('defaults', current['defaults'])
    if not isinstance(defaults_raw, dict):
        errors.append('defaults must be an object (hiring_manager, interviewers).')
        defaults_raw = current['defaults']
    defaults_links = _check_links({**current['defaults'], **defaults_raw}, 'defaults', links, errors)
    defaults = {'hiring_manager': defaults_links['hiring_manager'], 'interviewers': defaults_links['interviewers']}

    jobs = []
    jobs_raw = raw.get('jobs')
    if jobs_raw is not None:
        if not isinstance(jobs_raw, list):
            errors.append('jobs must be a list.')
        else:
            current_jobs = {j['slug']: j for j in export_doc()['jobs']}
            slugs = set()
            for index, item in enumerate(jobs_raw, start=1):
                if isinstance(item, dict):
                    slug_guess = slugify(_text(item.get('slug')) or _text(item.get('title')))[:60]
                    if slug_guess not in current_jobs:
                        item = {**defaults, **item}  # a new role starts with the default people
                job = _check_job(item, index, errors, warnings, links=links, current_jobs=current_jobs)
                if job is None:
                    continue
                if job['slug'] in slugs:
                    errors.append(f'Two jobs share the slug "{job["slug"]}".')
                    continue
                slugs.add(job['slug'])
                jobs.append(job)

    doc = {
        'format': FORMAT,
        'public': bool(raw.get('public', current.get('public'))),
        'page': page,
        'form': {'questions': questions},
        'email': email,
        'interviews': interviews,
        'defaults': defaults,
        'offer': offer,
        'onboarding': onboarding,
        'handbook': handbook,
        'checkin': checkin,
        'texts': texts,
        'jobs': jobs,
        'has_jobs': jobs_raw is not None,
    }
    return {'ok': not errors, 'errors': errors, 'warnings': warnings, 'doc': doc}


# ── Changes (what Save would do) ────────────────────────────────────────────


def summarize_changes(current: dict, new: dict) -> list[str]:
    out: list[str] = []
    if bool(current.get('public')) != bool(new.get('public')):
        out.append('Careers page turns ' + ('ON (public)' if new.get('public') else 'OFF (hidden)'))
    for key in DEFAULT_PAGE:
        if current['page'].get(key) != new['page'].get(key):
            out.append(f'Page: {key} changes')
    cur_q = {q['key']: q for q in current['form']['questions']}
    new_q = {q['key']: q for q in new['form']['questions']}
    for key in new_q:
        if key not in cur_q:
            out.append(f'Form: new question "{new_q[key]["label"]}"')
        elif cur_q[key] != new_q[key]:
            out.append(f'Form: "{new_q[key]["label"]}" changes')
    for key in cur_q:
        if key not in new_q:
            out.append(f'Form: question "{cur_q[key]["label"]}" removed')
    if [q['key'] for q in current['form']['questions']] != [q['key'] for q in new['form']['questions']] and \
            set(cur_q) == set(new_q):
        out.append('Form: question order changes')
    for key in ('from', 'reply_to', 'notify', 'review_day', 'reply_days'):
        if current['email'].get(key) != new['email'].get(key):
            out.append(f'Email: {key} → {new["email"].get(key) or "(none)"}')
    for key in EMAIL_KEYS:
        if current['email'].get(key) != new['email'].get(key):
            out.append(f'Email: the {key} email changes')
    for key in NOT_NOW_KEYS:
        if (current['email'].get('not_now') or {}).get(key) != (new['email'].get('not_now') or {}).get(key):
            out.append(f'Email: the "not now" ({key}) email changes')
    for key in DEFAULT_INTERVIEWS:
        if (current.get('interviews') or {}).get(key) != (new.get('interviews') or {}).get(key):
            value = new['interviews'].get(key)
            out.append(f'Interviews: {key} → {", ".join(value) if isinstance(value, list) else value}')
    for key in DEFAULT_OFFER:
        if (current.get('offer') or {}).get(key) != (new.get('offer') or {}).get(key):
            out.append(f'Offer: {key.replace("_", " ")} changes')
    cur_items = {i['key']: i for i in (current.get('onboarding') or {}).get('items', [])}
    new_items = {i['key']: i for i in (new.get('onboarding') or {}).get('items', [])}
    for key, item in new_items.items():
        if key not in cur_items:
            out.append(f'Onboarding: new item "{item["label"]}"')
        elif cur_items[key] != item:
            out.append(f'Onboarding: "{item["label"]}" changes')
    for key, item in cur_items.items():
        if key not in new_items:
            out.append(f'Onboarding: item "{item["label"]}" removed (new hires only)')
    for key in DEFAULT_HANDBOOK:
        if (current.get('handbook') or {}).get(key) != (new.get('handbook') or {}).get(key):
            out.append(f'Handbook draft: {key} changes (publish it in People → Onboarding to use it)')
    for key in DEFAULT_CHECKIN:
        if (current.get('checkin') or {}).get(key) != (new.get('checkin') or {}).get(key):
            out.append(f'Check-ins: {key.replace("_", " ")} changes (new check-ins only)')
    for key in DEFAULT_TEXTS:
        if (current.get('texts') or {}).get(key) != (new.get('texts') or {}).get(key):
            out.append(f'Texts: {key.replace("_", " ")} changes')
    for key in DEFAULT_ROLE_PEOPLE:
        if (current.get('defaults') or {}).get(key) != (new.get('defaults') or {}).get(key):
            value = new['defaults'].get(key)
            shown = ', '.join(value) if isinstance(value, list) else value
            out.append(f'Defaults for new roles: {key.replace("_", " ")} → {shown or "(none)"}')
    if new.get('has_jobs'):
        cur_jobs = {j['slug']: j for j in current.get('jobs') or []}
        for job in new['jobs']:
            old = cur_jobs.get(job['slug'])
            if old is None:
                out.append(f'Job: new "{job["title"]}" ({job["status"]})')
                continue
            changed = [f for f in JOB_FIELDS if old.get(f) != job.get(f)]
            if changed:
                out.append(f'Job "{job["title"]}": {", ".join(changed)}')
            for link in JOB_LINKS:
                if old.get(link) != job.get(link):
                    shown = job.get(link)
                    shown = ', '.join(shown) if isinstance(shown, list) else shown
                    out.append(f'Job "{job["title"]}": {link.replace("_", " ")} → {shown or "(none)"}')
        for slug, old in cur_jobs.items():
            if slug not in {j['slug'] for j in new['jobs']}:
                out.append(f'Job "{old["title"]}" is not in the file: left as it is (close it in Jobs to hide it)')
    return out


# ── Save ────────────────────────────────────────────────────────────────────


@transaction.atomic
def apply_doc(doc: dict, *, user) -> None:
    """Save a checked doc: the setting, then upsert jobs by slug. Jobs missing from the file are left alone."""
    from apps.hiring.models import Job

    current = load_setting()
    _save_setting({
        'public': bool(doc['public']),
        'page': doc['page'],
        'form': doc['form'],
        'email': doc['email'],
        'interviews': doc.get('interviews') or current['interviews'],
        'defaults': doc.get('defaults') or current['defaults'],
        'offer': doc.get('offer') or current['offer'],
        'onboarding': doc.get('onboarding') or current['onboarding'],
        'handbook': doc.get('handbook') or current['handbook'],
        'checkin': doc.get('checkin') or current['checkin'],
        'texts': doc.get('texts') or current['texts'],
        'preview_key': current.get('preview_key') or secrets.token_urlsafe(12),
    }, user=user)
    if not doc.get('has_jobs'):
        return
    from apps.hr.models import Department

    def staff(email: str):
        return staff_users().filter(email__iexact=email).first() if email else None

    for job in doc['jobs']:
        values = {f: job[f] for f in JOB_FIELDS if f != 'slug'}
        for money in ('pay_min', 'pay_max'):
            values[money] = Decimal(str(values[money])) if values[money] is not None else None
        values['updated_by'] = user
        values['department'] = Department.objects.filter(slug=job['department']).first() if job['department'] else None
        values['hiring_manager'] = staff(job['hiring_manager'])
        row, _ = Job.objects.update_or_create(slug=job['slug'], defaults=values)
        row.interviewers.set([u for u in (staff(e) for e in job['interviewers']) if u])


# ── Email text ──────────────────────────────────────────────────────────────


def fill(template: str, values: dict) -> str:
    """Fill {placeholders}; unknown ones stay as written, and a stray brace in edited words is just a brace."""
    def one(match):
        name = match.group(1)
        if name not in values:
            return match.group(0)
        value = values[name]
        return '' if value is None else str(value)

    return re.sub(r'\{([a-z_]+)\}', one, template or '')


def universal_template(key: str, setting: dict | None = None) -> dict:
    email = (setting or load_setting())['email']
    if key.startswith('not_now.'):
        blocks = email.get('not_now') or {}
        return blocks.get(key[len('not_now.'):]) or blocks.get('default') or DEFAULT_EMAIL['not_now']['default']
    return email.get(key) or DEFAULT_EMAIL[key]


def template(key: str, application=None) -> dict:
    """The email to send: the applied role's own version when it has one, else the universal one."""
    if application is not None and getattr(application, 'pk', None):
        for job in application.jobs.order_by('sort_order', 'title'):
            block = (job.emails or {}).get(key)
            if isinstance(block, dict) and block.get('subject') and block.get('body'):
                return block
    return universal_template(key)


def not_now_template(reason: str, application=None) -> dict:
    key = f'not_now.{reason}' if reason in NOT_NOW_KEYS else 'not_now.default'
    return template(key, application)
