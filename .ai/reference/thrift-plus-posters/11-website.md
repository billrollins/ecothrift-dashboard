<!-- The website pieces for Thrift+ (owner 10-15). Written by the master design session ("Thrift+ Design"); built by Eco-Thrift. Words follow the rulebook (V2, V8, P10) and design language 3.4. -->
# Thrift+ on the public website: spec (10-15)

The owner, 10-15:
1. "A front and center mention of the Scanning app on the front page and the Visit us."
2. "I would like to publish these posters as a quick What is thrift+ page, maybe adjacent to the terms page."
3. "'Sell with us' should be on a toggle or just removed everywhere." **Done by Eco-Thrift:** removed everywhere; P10 brings it back when consignment starts.

**Switch:** Thrift+ is off for customers until launch. Every piece below shows **only when Thrift+ is on for customers**, on the same switch the app uses, so nothing points shoppers at a closed app before launch. The owner can preview.

**Assets:** `workspace/posters2/web/`. Copy them to `frontend-public/public/thriftplus/`.

| File | Use |
|---|---|
| `thriftplus-poster-1-meet.webp` (1300 x 1900) and `-650.webp` | The posters, from the locked print files (`print/v4`); use srcset, 650 on phones |
| `thriftplus-poster-2-thriftbucks.webp` and `-650.webp` | |
| `thriftplus-poster-3-returns.webp` and `-650.webp` | |
| `thriftplus-app-phone.webp` (604 x 1256, transparent corners) | The app in a phone frame (the real scan of the toy truck), for the home band |
| `thriftplus-og.jpg` (1200 x 630) | Share image for /thriftplus (og:image) |

## 1. Home page: the app band

Put it directly under the hero ("Quality goods, fair prices, every week."), full width, before anything else. The phone image is on the right (left on phones, above the text); the text is on the left.

- **Pill:** `NEW · THRIFT+`
- **Heading:** **Scan any tag. See its ThriftBucks.**
- **Text:** Thrift+ is free to join. In the store, the Thrift+ app shows what any item gives back in ThriftBucks, and whether it has 3-day returns.
- **Buttons:** **Open the app** → `/scan` (primary) · **What is Thrift+?** → `/thriftplus` (secondary)
- **Image:** `thriftplus-app-phone.webp`, alt "The Thrift+ app scanning a price tag in the store"

## 2. Visit page: "Bring your phone"

A block near the top, after the address and hours:

- **Heading:** **Bring your phone**
- **Text:** Scan any price tag with the Thrift+ app to see its ThriftBucks, and whether it has 3-day returns. Not a member yet? Start on your phone, then finish at any register.
- **Buttons:** **Open the app** → `/scan` · **Join** → `/join`

## 3. The "What is Thrift+?" page, at `/thriftplus`

`/thriftplus` stops redirecting to /terms and becomes this page. `/thriftplus/warranty` stays → `/terms#s8`, and `/thriftplus/terms` → `/terms`. Add a header nav link **Thrift+** → `/thriftplus` (behind the switch). At the top of /terms, add the line **"New to Thrift+? See what it is →"** linking here. This page links back to /terms, so the two sit side by side.

Language: it follows /terms. The same English | Español toggle sets it (?lang=, the remembered choice, a Spanish phone). The posters stay in English; the words below have both languages.

- **Page title** (tab and SEO): `What is Thrift+? · Eco-Thrift` / `¿Qué es Thrift+? · Eco-Thrift`
- **Description:** ThriftBucks, 3-day returns and more. Free to join. Nothing owed.
- **H1:** **What is Thrift+?** / **¿Qué es Thrift+?**
- **Intro:** ThriftBucks, 3-day returns and more. Free to join. Nothing owed. / ThriftBucks, devoluciones en 3 días y más. Unirse es gratis. No se debe nada.
- **Buttons** (under the intro): **Join** → `/join` · **Open the app** → `/scan` · **Full terms** → `/terms` / **Únase** · **Abrir la app** · **Términos completos**

Then three sections in order. Each is the poster (tap to open it full size) with its heading and a short text beside it on desktop, or under it on phones:

1. **Meet Thrift+** / **Conozca Thrift+**
   - Membership is free and easy: start on your phone, finish at any register. ThriftBucks grow as items sit, and you have 3 days to bring a qualifying item back.
   - Ser miembro es gratis y fácil: empiece en su teléfono y termine en cualquier caja. Los ThriftBucks crecen mientras el artículo está en la tienda, y tiene 3 días para devolver un artículo que califique.
   - alt: "Poster: Meet Thrift+. Free and easy membership, ThriftBucks that grow as items sit, and 3-day returns."
2. **Get ThriftBucks** / **Reciba ThriftBucks**
   - Members collect ThriftBucks on most items. On this $49.36 lamp, that's 13.69 ThriftBucks to use within 30 days, or redeem them instantly at 50%. Non-members pay the tag.
   - Los miembros reúnen ThriftBucks en la mayoría de los artículos. En esta lámpara de $49.36, son 13.69 ThriftBucks para usar dentro de 30 días, o canjéelos al instante al 50%. Quienes no son miembros pagan la etiqueta.
   - alt: "Poster: Get ThriftBucks. A member gets 13.69 ThriftBucks on a $49.36 lamp; a non-member gets none."
3. **3-day returns** / **Devoluciones en 3 días**
   - Doesn't work? Bring it back within 3 days, for any reason, on qualifying items: 80% of what you paid comes back as Thrift+ credit. Non-members: all sales final, sold AS IS.
   - ¿No funciona? Tráigalo dentro de 3 días, por cualquier razón, si el artículo califica: el 80% de lo que pagó se le regresa como crédito Thrift+. Quienes no son miembros: ventas finales, se vende AS IS.
   - alt: "Poster: 3-day returns. Members can bring a qualifying item back within 3 days for 80% as Thrift+ credit; non-members can't."

- **Closing line:** The full rules are in the **Thrift+ terms**. / Las reglas completas están en los **términos de Thrift+**. (link → `/terms`)
- **og:image:** `thriftplus-og.jpg`

**Words to check:**
- **English:** never the V2 words, no "card", no consignment (P10), and "Free to join. Nothing owed." as written.
- **Spanish:** the lines above are drafts for the native-speaker check, alongside terms-es.md.
