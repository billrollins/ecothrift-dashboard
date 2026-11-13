/** Design Lab > Theme: every token of theme/eco.ts with its swatch and use, the fonts, and the MUI parts dressed in it. */
import { Alert, Box, Button, Chip, LinearProgress, Stack, Switch, Tab, Tabs, TextField, Typography } from '@mui/material';
import logoFull from '../../assets/eco-thrift-logo-color.svg';
import logoWhite from '../../assets/eco-thrift-logo-white.svg';
import { PageShell, Section, StatusPill } from '../../components/page/PageKit';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { eco, ecoFonts, ecoShadow, type EcoToken } from '../../theme/eco';

/** Relative luminance contrast, so each swatch states what reads on it. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUPS: { title: string; hint: string; tokens: [EcoToken, string][] }[] = [
  { title: 'Grounds', hint: 'Warm neutrals carry the page.', tokens: [['canvas', 'Page background'], ['card', 'Cards, menus, fields'], ['fill', 'Quiet fills: table heads, chips'], ['line', 'Hairline borders']] },
  { title: 'Type', hint: 'Secondary text about 9:1; nothing under 12px.', tokens: [['ink', 'All text'], ['inkSoft', 'Secondary text'], ['inkFaint', 'Hints, disabled']] },
  {
    title: 'Brand',
    hint: 'From the sign brand board: green, brown, blue.',
    tokens: [
      ['forest', 'Main buttons, links, selected'], ['forestDeep', 'Pressed'], ['leaf', 'The one accent: tab, focus, progress'],
      ['mint', 'Leaf wash: selected rows'], ['kraft', 'The icon detail; never text'], ['oat', 'Warm paper panel'],
      ['bark', 'Dark warm panel'], ['denim', 'Information'], ['sky', 'Thrift+ sky; decoration'], ['mist', 'Denim wash'],
    ],
  },
  {
    title: 'Status',
    hint: 'Only ever used for status. Each has a soft wash and a text shade that reads on it.',
    tokens: [
      ['good', 'Done, approved'], ['goodSoft', 'Good wash'], ['wait', 'Waiting, needs a look'], ['waitSoft', 'Wait wash'],
      ['problem', 'Problem, overdue, delete'], ['problemSoft', 'Problem wash'], ['info', 'New, for your information'], ['infoSoft', 'Info wash'],
    ],
  },
];

const PRINCIPLES = [
  ['Readable first', 'Secondary text about 9:1 on a card, nothing under 12px. When in doubt, the more legible option.'],
  ['Green is the brand', 'Forest for what you press, Leaf for the one thing to look at, kraft for the detail in each icon.'],
  ['Rounded to greet, plain to work', 'Titles are Nunito. Everything you read, scan or type is Manrope.'],
  ['Say it once', 'The top bar names the page. No second title, no tagline: a page starts with what you came to do.'],
] as const;

function Swatch({ token, use }: { token: EcoToken; use: string }) {
  const hex = eco[token];
  const onWhite = contrast(hex, '#FFFFFF');
  const onInk = contrast(hex, eco.ink);
  const textOn = onWhite >= onInk ? eco.card : eco.ink;
  const ratio = Math.max(onWhite, onInk);
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '12px', overflow: 'hidden', bgcolor: 'background.paper', minWidth: 0 }}>
      <Box sx={{ height: 64, bgcolor: hex, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', p: 1 }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: ecoFonts.mono, color: textOn }}>{hex}</Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: textOn }}>Aa {ratio.toFixed(1)}</Typography>
      </Box>
      <Box sx={{ p: 1 }}>
        <Typography variant="subtitle2" sx={{ fontFamily: ecoFonts.mono, fontSize: '0.8125rem' }}>{token}</Typography>
        <Typography variant="caption" component="div">{use}</Typography>
      </Box>
    </Box>
  );
}

const swatchGrid = { display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' } } as const;

export default function ThemeTab() {
  const I = ECO_ICONS;
  return (
    <PageShell width="wide">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        {PRINCIPLES.map(([title, body], i) => (
          <Section key={title}>
            <Typography variant="overline" sx={{ color: 'primary.main' }}>0{i + 1}</Typography>
            <Typography variant="h5" sx={{ mb: 0.5 }}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{body}</Typography>
          </Section>
        ))}
      </Box>

      <Section title="Logo" hint="Leaf mark, wordmark and tagline stay together. Colour logo on light, white logo on Forest. The vector masters are in design/brand/logo.">
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Box sx={{ p: 3, borderRadius: '12px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', display: 'grid', placeItems: 'center' }}>
            <Box component="img" src={logoFull} alt="Eco-Thrift logo" sx={{ width: 240, maxWidth: '100%' }} />
          </Box>
          <Box sx={{ p: 3, borderRadius: '12px', bgcolor: 'primary.main', display: 'grid', placeItems: 'center' }}>
            <Box component="img" src={logoWhite} alt="Eco-Thrift logo, white" sx={{ width: 240, maxWidth: '100%' }} />
          </Box>
        </Box>
      </Section>

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title} hint={g.hint}>
          <Box sx={swatchGrid}>
            {g.tokens.map(([token, use]) => <Swatch key={token} token={token} use={use} />)}
          </Box>
        </Section>
      ))}

      <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Section title="Type" hint="Nunito for titles, Manrope for work.">
          <Stack spacing={1.25}>
            <Typography variant="h2">Good morning, Bill</Typography>
            <Typography variant="h4">Friday on the floor</Typography>
            <Typography variant="h6">Section title</Typography>
            <Typography variant="overline" color="text.secondary">Overline label</Typography>
            <Typography variant="body1">
              Body text is Manrope at a comfortable size, with enough line height to read a paragraph without effort.
            </Typography>
            <Typography variant="body2" color="text.secondary">Secondary text is softer, never grey on grey.</Typography>
            <Typography variant="caption">Caption, 12.5px: the smallest text anywhere.</Typography>
          </Stack>
        </Section>

        <Section title="Buttons and status" hint="One green button per view. Everything else is quieter.">
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" startIcon={<I.add />}>New truck</Button>
              <Button variant="outlined" startIcon={<I.download />}>Export</Button>
              <Button variant="text">Cancel</Button>
              <Button variant="outlined" color="error" startIcon={<I.delete />}>Delete</Button>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <StatusPill tone="good" label="Finished" />
              <StatusPill tone="wait" label="Waiting" />
              <StatusPill tone="problem" label="Short 3" />
              <StatusPill tone="info" label="New" />
              <StatusPill tone="quiet" label="Draft" />
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label="All" color="primary" />
              <Chip label="Furniture" onDelete={() => {}} />
              <Chip label="Wayfair" variant="outlined" />
            </Stack>
            <Tabs value={0}>
              <Tab label="Overview" />
              <Tab label="Photos" />
              <Tab label="Sales" />
            </Tabs>
            <Stack direction="row" spacing={2} alignItems="center">
              <Switch defaultChecked />
              <LinearProgress variant="determinate" value={64} sx={{ flex: 1 }} />
              <Typography variant="caption">64%</Typography>
            </Stack>
          </Stack>
        </Section>

        <Section title="Fields" hint="White field, hairline border, a Leaf focus ring.">
          <Stack spacing={2}>
            <TextField label="Item" defaultValue="Walnut 6-drawer dresser" size="small" fullWidth />
            <TextField label="Note for the floor" placeholder="Anything we should know?" multiline minRows={2} fullWidth />
            <TextField label="Retail price" defaultValue="five hundred" error helperText="Type the price as a number, like 529.00." size="small" fullWidth />
          </Stack>
        </Section>

        <Section title="Messages" hint="Soft washes; the words do the work.">
          <Stack spacing={1.25}>
            <Alert severity="success">Truck T-417 received: 18 pallets.</Alert>
            <Alert severity="warning">Two price checks are waiting on you.</Alert>
            <Alert severity="error">The label printer did not answer. Nothing was printed.</Alert>
            <Alert severity="info">November's sales report is ready.</Alert>
          </Stack>
        </Section>
      </Box>

      <Section title="Depth" hint="Three levels only.">
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' } }}>
          {([['Rest', ecoShadow.rest, 'Cards on the page'], ['Raised', ecoShadow.raised, 'Hover, sticky bars'], ['Overlay', ecoShadow.overlay, 'Menus and dialogs']] as const).map(
            ([name, shadow, use]) => (
              <Box key={name} sx={{ p: 2.5, borderRadius: '14px', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: shadow }}>
                <Typography variant="subtitle2">{name}</Typography>
                <Typography variant="caption">{use}</Typography>
              </Box>
            ),
          )}
        </Box>
      </Section>
    </PageShell>
  );
}
