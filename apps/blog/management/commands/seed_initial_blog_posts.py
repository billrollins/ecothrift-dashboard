"""Seed the three founder blog posts (previously static in
`frontend-public/src/data/content.ts`) into the database under an "Early days" series.

Idempotent: skips a post whose slug already exists. Run once locally and once on prod:

    python manage.py seed_initial_blog_posts

Hero images are uploaded to storage (S3 in prod, local media in dev) so old and new posts
share one consistent proxied image path.
"""
from __future__ import annotations

import mimetypes
import os
import uuid
from datetime import datetime, time
from html import escape

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.blog.models import BlogImage, BlogPost, BlogSeries
from apps.core.models import S3File

SERIES_NAME = 'Early days'

POSTS = [
    {
        'slug': 'navigating-growth',
        'title': 'Navigating the Challenges and Opportunities of Growth',
        'excerpt': 'On building departments, reaching customers honestly, and laying the groundwork for consignment.',
        'date_iso': '2024-06-10',
        'img': 'navigating-growth.png',
        'tags': ['GrowingPains'],
        'body': [
            "As Eco-Thrift continues to expand, we find ourselves in an exciting yet challenging phase of growth. We're learning to navigate the complexities of becoming a larger company with multiple departments, each with its own unique set of responsibilities and goals. One of our main focuses has been on improving communication and collaboration between these departments to ensure that we're all working together seamlessly towards our common mission. This has involved implementing new systems and processes, providing training and support for our team members, and fostering a culture of open communication and continuous improvement.",
            "Another key aspect of our growth has been our increased focus on advertising and customer communication. We recognize that to truly make an impact, we need to reach a wider audience and engage with our customers in meaningful ways. However, as a startup, we've had to be strategic about where we allocate our limited resources. We've been experimenting with different marketing channels and tactics, tracking our results, and adjusting our approach based on what we learn. It's been a process of trial and error, but we're committed to finding the most effective ways to connect with our customers and share our mission.",
            "As part of our efforts to reach more customers, we've been investing in our website and online sales capabilities. We know that sometimes people prefer the convenience of shopping online, and we want to make sure that we're providing a seamless and enjoyable experience. However, translating the unique Eco-Thrift experience to an online platform has come with its own set of challenges. We've been working hard to improve our website's functionality, streamline our online purchasing process, and find ways to convey the story and mission behind each item we sell. It's an ongoing process, but we're excited about the potential for growth in this area.",
            "One of the core aspects of Eco-Thrift's mission is our commitment to repair and recycling. Our Restoration Department is the heart of this effort, and we've been working to grow and develop this team. We've invested in training and equipment to help our team members become experts in their craft, and we're constantly seeking out new techniques and best practices for restoring and recycling a wide range of items. However, as we've grown, we've also encountered new challenges related to space, workflow, and efficiency. We're currently exploring options for expanding our restoration facilities and optimizing our processes to help us keep up with the increasing demand for our services.",
            "Finally, as we look towards the future and the potential for expanding our business model to include consignment, we recognize the importance of having a solid foundation in place. We've been working hard to perfect our current processes, from intake and processing to sales and customer service. This has involved a lot of analysis, discussion, and refinement, as we seek to identify areas for improvement and implement changes that will help us scale more effectively. At the same time, we're starting to lay the groundwork for our consignment program, researching best practices, and engaging with potential partners and stakeholders. It's a complex undertaking, but we believe that it has the potential to greatly expand our impact and help us achieve our mission on an even larger scale.",
            "At Eco-Thrift, we're committed to being transparent about our journey as a startup and the challenges and opportunities we face along the way. We believe that by inviting our customers into this journey, we can build a stronger, more engaged community around our mission. Together, we can work towards a more sustainable, responsible way of consuming and living. Thank you for being a part of our story.",
        ],
    },
    {
        'slug': 'turns-two',
        'title': 'Eco-Thrift Turns Two: A Look Back at Where It All Began',
        'excerpt': 'How Carrie and I went from an empty room on 96th & Q to a store Omaha has welcomed as its own.',
        'date_iso': '2023-11-11',
        'img': 'turns-two.png',
        'tags': ['Beginnings'],
        'body': [
            'As the CEO of Eco-Thrift, I am proud to introduce you to the company my wife Carrie and I started in June of 2022. When we first received the keys to our retail location on 96th and Q Street, we were faced with an empty space and a peculiar room in the middle. Despite having no inventory or employees, Carrie and I had a clear vision of what we wanted to achieve with Eco-Thrift.',
            'Carrie, with her background as the owner of Dark Horse, an Aveda Hair Salon in Dundee that she has successfully grown over the past 10 years, brings a wealth of experience in business management and customer service. As for myself, I grew up in Omaha and graduated from the University of Nebraska at Omaha with a Math Degree. I spent 10 years working as an Actuary and Data Scientist at Mutual of Omaha, developing a strong analytical skillset and a deep understanding of business operations.',
            'At Eco-Thrift, our mission is to promote the repair, reuse, and recycling of consumer goods, providing an affordable and eco-friendly alternative to traditional retail. By offering gently used household items sourced through consignment and liquidation inventory, we aim to stimulate a circular economy, which is essential for a sustainable future. This approach reduces the need for constantly extracting raw materials to create single-use, disposable items that end up in landfills far too quickly.',
            "When you shop at Eco-Thrift, you'll find a wide variety of carefully selected and restored items at unbeatable prices. Clear tags and fair pricing make it easy to shop with confidence. By choosing to shop with us, you become an integral part of the solution, contributing to a more sustainable and responsible way of consuming goods.",
            "As we continue to expand, Carrie and I remain committed to our core values and are thrilled about the future of Eco-Thrift. Our team has grown to include talented individuals across multiple departments, each playing a crucial role in our mission. In our Restoration department, the magic of restoring and recycling takes place, giving new life to items that might otherwise end up in landfills. Our Processing team meticulously inspects and prepares each item for sale, ensuring that our customers receive quality products. The Retail department creates an inviting and organized shopping experience, making it easy for customers to find the perfect treasure. Our Online Sales and Marketing team works tirelessly to expand our reach and spread the message of sustainable shopping to a wider audience. And with our new Deliveries service, we're making eco-friendly shopping more convenient than ever.",
            'With each passing day, we are scaling our operations to make an even greater impact on our community and the environment. We invite you to join us on this exciting journey and become part of the Eco-Thrift family. Together, we can revolutionize the way we consume goods and create a more sustainable future for generations to come. Visit our store or shop online today, and experience the joy and satisfaction of making a positive difference with every purchase.',
        ],
    },
    {
        'slug': 'our-vision',
        'title': "Envisioning a Sustainable Future: Eco-Thrift's Ambitious Plans",
        'excerpt': 'Immersive shopping centers, an expanded online presence, and a commitment to community impact.',
        'date_iso': '2022-06-05',
        'img': 'our-vision.webp',
        'tags': ['ThinkBig'],
        'body': [
            'For Those Who Dare to Think Big:',
            "At Eco-Thrift, we've always believed that big challenges require even bigger dreams. From the day Carrie and I started this journey, we knew that creating a truly sustainable future would demand bold vision, unwavering commitment, and the courage to imagine what others might dismiss as impossible. Now, as we stand at the threshold of a new chapter in our story, we invite you - our loyal customers, our dedicated team members, and our cherished community partners - to dream with us.",
            "As we envision the future of sustainable shopping, one of the most exciting possibilities is the creation of large, in-person shopping centers that seamlessly blend nature and retail. Imagine stepping into a repurposed shopping mall, once abandoned but now thriving with new life. Lush greenery, natural light, and eco-friendly design elements create an inviting atmosphere that celebrates the harmony between consumption and conservation. These centers would serve as immersive hubs for our mission of restoring, repairing, and recycling consumer goods, offering a wide range of sustainable products all under one roof. By partnering with local retailers to divert their liquidation items directly to these centers, we can create a comprehensive and engaging sustainable shopping experience that appeals to everyone. It's a vision that encapsulates our commitment to innovation, accessibility, and environmental stewardship, and we're thrilled by the potential it holds for revolutionizing the way people shop and think about consumption.",
            "Within these immersive Eco-Thrift shopping centers, customers will discover a rich tapestry of sustainable offerings. As they explore the various sections of the repurposed mall, they'll encounter dedicated spaces for electronics, furniture, clothing, and more, each one showcasing carefully restored and repaired items that have been given a second chance at life. The diverse range of products, spanning different categories and price points, is united by our unwavering commitment to sustainability and waste reduction. Imagine strolling through an Eco-Thrift center and finding a beautifully restored vintage sofa in the furniture section, then wandering over to the electronics area to discover refurbished smartphones and laptops, before browsing a collection of one-of-a-kind, upcycled clothing items. It's a shopping experience that celebrates the value and potential of every item, inviting customers to rethink their relationship with consumption and waste. By creating these engaging, immersive spaces, we aim to revolutionize the way people approach shopping and inspire a new generation of conscious consumers who prioritize sustainability in every aspect of their lives.",
            "Alongside our physical expansion, we also envision a significant growth in our online presence. We aim to become the go-to online resource for repair and replacement parts, leveraging our expertise to help people extend the life of their belongings. Through engaging content on platforms like YouTube and social media, as well as our own website, we'll share our knowledge and empower people to embrace repair and restoration in their own lives. We also plan to offer repair and restoration as a service, allowing customers to bring in their cherished items for a new lease on life.",
            'As Eco-Thrift grows, we envision a future where our commitment to sustainability and community upliftment becomes an integral part of our identity. We believe that the restoration and repair of consumer goods is not just a means to create a cleaner, healthier planet, but also a powerful tool to restore hope and dignity to those facing adversity. In the years to come, we see Eco-Thrift partnering with local organizations to support initiatives that provide resources and opportunities for children in need, help former prisoners successfully re-enter society, aid individuals battling substance abuse, and tackle affordable housing and poverty relief. By dedicating a portion of our profits to these life-changing programs, we aim to create a ripple effect of positive change that extends far beyond our stores. Every item purchased at Eco-Thrift will contribute to both a healthier planet and the transformation of lives in our local communities. This is the inspiring vision that drives us forward, and we invite you to join us in building a future where sustainability and compassion go hand in hand.',
            'We envision Eco-Thrift becoming not just a leader in sustainable retail, but one of the largest and most impactful companies the world has ever seen. As automation and AI continue to transform many industries, we believe that the complex, hands-on work of restoration and repair will remain a vital source of meaningful employment. Eco-Thrift will be a place where people can come to learn valuable skills, contribute to an important mission, and build a brighter future for themselves and their communities.',
            "This is the future we're working towards at Eco-Thrift. It's a future where sustainable shopping is accessible and exciting, where the value of restoration is widely recognized, and where businesses like ours play a leading role in creating a more resilient, compassionate world. We know the journey ahead is long and full of challenges, but with the support of our customers, our team, and our communities, we believe anything is possible. Join us, and let's build this future together.",
            "Does this vision excite you? Do you want to be a part of making it a reality? Here's how you can help:",
            'Shop at Eco-Thrift and experience the joy of sustainable, affordable shopping.',
            'Be patient with us as we grow and provide constructive feedback to help us improve.',
            "If you see potential for partnership or collaboration, reach out to us - we're always eager to work with like-minded individuals and organizations.",
            "Spread the word about Eco-Thrift by leaving positive reviews on Google, Facebook, and other platforms, and don't forget to share your favorite finds with friends and family.",
            'Come work at Eco-Thrift!',
            "Your support is the key to turning this vision into a reality, and we can't wait to see what we can achieve together.",
        ],
    },
]


def _doc_from_paragraphs(paragraphs):
    return {
        'type': 'doc',
        'content': [
            {'type': 'paragraph', 'content': [{'type': 'text', 'text': p}]}
            for p in paragraphs
        ],
    }


def _html_from_paragraphs(paragraphs):
    return ''.join(f'<p>{escape(p)}</p>' for p in paragraphs)


class Command(BaseCommand):
    help = 'Seed the three founder blog posts under the "Early days" series (idempotent).'

    def handle(self, *args, **options):
        series, created = BlogSeries.objects.get_or_create(
            name=SERIES_NAME,
            defaults={'description': 'Where Eco-Thrift began, in Bill\'s words.', 'position': 0},
        )
        self.stdout.write(f'Series "{series.name}": {"created" if created else "exists"}')

        blog_dir = os.path.join(settings.BASE_DIR, 'frontend-public', 'public', 'blog')

        for data in POSTS:
            if BlogPost.objects.filter(slug=data['slug']).exists():
                self.stdout.write(f'  - {data["slug"]}: exists, skipping')
                continue

            hero = self._upload_hero(blog_dir, data['img'], data['title'])
            published_at = timezone.make_aware(
                datetime.combine(datetime.fromisoformat(data['date_iso']).date(), time(9, 0)),
                timezone.get_current_timezone(),
            )

            post = BlogPost(
                title=data['title'],
                slug=data['slug'],
                series=series,
                excerpt=data['excerpt'],
                tags=', '.join(data['tags']),
                hero_image=hero,
                hero_alt=data['title'],
                status=BlogPost.STATUS_PUBLISHED,
                published_at=published_at,
            )
            post.apply_body(
                body_html=_html_from_paragraphs(data['body']),
                body_json=_doc_from_paragraphs(data['body']),
            )
            post.save()
            self.stdout.write(self.style.SUCCESS(f'  - {data["slug"]}: created'))

        self.stdout.write(self.style.SUCCESS('Done.'))

    def _upload_hero(self, blog_dir, filename, alt):
        path = os.path.join(blog_dir, filename)
        if not os.path.exists(path):
            self.stdout.write(self.style.WARNING(f'    hero missing ({filename}); post will have no hero'))
            return None
        ext = os.path.splitext(filename)[1].lower() or '.jpg'
        key = f'blog/images/{uuid.uuid4().hex}{ext}'
        with open(path, 'rb') as fh:
            saved_path = default_storage.save(key, File(fh))
        size = os.path.getsize(path)
        content_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        s3_file = S3File.objects.create(
            key=saved_path, filename=filename, size=size, content_type=content_type,
        )
        return BlogImage.objects.create(s3_file=s3_file, alt=alt)
