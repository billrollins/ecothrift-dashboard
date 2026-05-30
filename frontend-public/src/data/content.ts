// Real Eco-Thrift copy, reconciled from the live-site scrape
// (.ai/reference/shopify-site-copy/site_copy.md). Reconciliations:
//  - Retail store is Eco-Thrift — Canfield (8425 W Center Rd). Applewood / 9717 Q St closed.
//  - Do not claim daily automatic markdowns on customer-facing copy (outdated).
//    The single "10% on Mondays" testimonial was dropped as inconsistent/outdated).

/** Canonical public origin (matches PUBLIC_SITE_CANONICAL_HOST on the server). */
export const SITE_URL = 'https://ecothrift.us'

/** Files in `frontend-public/public/` — use for `<img src>` (prod base is `/static/site/`). */
export function publicAssetUrl(path: string): string {
  const rel = path.replace(/^\//, '')
  return `${import.meta.env.BASE_URL}${rel}`
}

export function absolutePublicAssetUrl(path: string): string {
  const url = publicAssetUrl(path)
  return url.startsWith('http') ? url : `${SITE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

export const STORE = {
  tagline: 'Restore, Reuse, Reimagine Our Future',
  metaDescription:
    'Eco-Thrift is a liquidation and thrift store in Omaha, NE that aims to stimulate a circular economy.',
  email: 'sales.ecothrift@outlook.com',
  retail: {
    name: 'Eco-Thrift — Canfield',
    address: '8425 W Center Rd, Omaha, NE 68124',
    hours: '9 AM – 6 PM, Monday – Saturday · Closed Sunday',
    phone: '(402) 881-9861',
    phoneHref: '+14028819861',
    /** Google Maps place pin (Eco-Thrift — Canfield), not street-address geocode. */
    mapsLat: 41.2336219,
    mapsLng: -96.0442073,
    mapsPlaceUrl:
      'https://www.google.com/maps/place/Eco-Thrift+-+Canfield/@41.2336219,-96.0442073,17z/data=!3m1!4b1!4m6!3m5!1s0x87938d8771cb8e6d:0x8b75ff46ec9d2adb!8m2!3d41.2336219!4d-96.0442073!16s%2Fg%2F11xw30bys8',
  },
} as const

export const AUTHOR = {
  name: 'Bill Rollins',
  role: 'Founder & CEO, Eco-Thrift',
  initials: 'BR',
  photo: '/author/bill-rollins.jpg',
} as const

/** schema.org Store / LocalBusiness for the retail location (used on Home + Visit). */
export const STORE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  '@id': `${SITE_URL}/#store`,
  name: 'Eco-Thrift — Canfield',
  description: STORE.metaDescription,
  url: SITE_URL,
  telephone: STORE.retail.phoneHref,
  email: STORE.email,
  address: {
    '@type': 'PostalAddress',
    streetAddress: '8425 W Center Rd',
    addressLocality: 'Omaha',
    addressRegion: 'NE',
    postalCode: '68124',
    addressCountry: 'US',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
  ],
  geo: {
    '@type': 'GeoCoordinates',
    latitude: STORE.retail.mapsLat,
    longitude: STORE.retail.mapsLng,
  },
} as const

/** Open Google Maps directions to the retail place pin. */
export function retailMapsDirectionsUrl(): string {
  const { mapsLat, mapsLng } = STORE.retail
  return `https://www.google.com/maps/dir/?api=1&destination=${mapsLat},${mapsLng}`
}

/** Interactive Google Maps embed for the retail store (no API key). */
export function retailMapsEmbedSrc(): string {
  const { name, mapsLat, mapsLng } = STORE.retail
  const q = `${encodeURIComponent(name)}+@${mapsLat},${mapsLng}`
  return `https://www.google.com/maps?q=${q}&z=16&output=embed`
}

/** Web-shop categories — keep in sync with apps/buying/taxonomy_v1.py (slugs via Django slugify). */
export interface ShopCategory {
  name: string
  slug: string
  description: string
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { name: 'Kitchen & dining', slug: 'kitchen-dining', description: '' },
  { name: 'Furniture', slug: 'furniture', description: '' },
  { name: 'Outdoor & patio furniture', slug: 'outdoor-patio-furniture', description: '' },
  { name: 'Home décor & lighting', slug: 'home-decor-lighting', description: '' },
  { name: 'Household & cleaning', slug: 'household-cleaning', description: '' },
  { name: 'Bedding & bath', slug: 'bedding-bath', description: '' },
  { name: 'Storage & organization', slug: 'storage-organization', description: '' },
  { name: 'Toys & games', slug: 'toys-games', description: '' },
  { name: 'Sports & outdoors', slug: 'sports-outdoors', description: '' },
  { name: 'Tools & hardware', slug: 'tools-hardware', description: '' },
  { name: 'Office & school supplies', slug: 'office-school-supplies', description: '' },
  { name: 'Electronics', slug: 'electronics', description: '' },
  { name: 'Baby & kids', slug: 'baby-kids', description: '' },
  { name: 'Health, beauty & personal care', slug: 'health-beauty-personal-care', description: '' },
  { name: 'Apparel & accessories', slug: 'apparel-accessories', description: '' },
  { name: 'Books & media', slug: 'books-media', description: '' },
  { name: 'Pet supplies', slug: 'pet-supplies', description: '' },
  { name: 'Party, seasonal & novelty', slug: 'party-seasonal-novelty', description: '' },
  { name: 'Mixed lots & uncategorized', slug: 'mixed-lots-uncategorized', description: '' },
]

export interface Step {
  n: number
  title: string
  text: string
}

export const HOW_IT_WORKS: Step[] = [
  {
    n: 1,
    title: 'Browse the floor',
    text: 'New finds arrive all week — brand-name overstock and gently used goods, inspected and ready. Most items are one of a kind.',
  },
  {
    n: 2,
    title: 'Know the price',
    text: 'Tags are clear on the shelf — no guessing. Most items are one of a kind, so if something catches your eye, grab it while you are here.',
  },
  {
    n: 3,
    title: 'Take it home',
    text: 'Pay in store and carry it out the same day, or reserve online and pick up at our Canfield store.',
  },
]

export interface Testimonial {
  quote: string
  who: string
}

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'Great prices on new items — electronics, furniture, home goods, kids clothing. There is always something new to check out.',
    who: 'Frequent customer',
  },
  {
    quote:
      'Easy to navigate, easy to see what they are selling and know the price without pulling out your phone. A genuinely pleasant place to shop.',
    who: 'Verified shopper',
  },
  {
    quote:
      'It is hardly a thrift store — everything is brand new or very close. The prices are fair, and there is always something new to discover.',
    who: 'Regular customer',
  },
]

export interface BlogPost {
  slug: string
  series: string
  title: string
  excerpt: string
  /** Display date, e.g. "June 10, 2024" */
  date: string
  /** ISO date for sorting / structured data */
  dateIso: string
  /** Root-relative image URL under `/blog/` */
  img: string
  tags: string[]
  body: string[]
}

/** Founder blog posts (newest first). Source: `.ai/reference/old blogs/`. */
export const POSTS: BlogPost[] = [
  {
    slug: 'navigating-growth',
    series: 'Early days',
    title: 'Navigating the Challenges and Opportunities of Growth',
    excerpt:
      'On building departments, reaching customers honestly, and laying the groundwork for consignment.',
    date: 'June 10, 2024',
    dateIso: '2024-06-10',
    img: '/blog/navigating-growth.png',
    tags: ['GrowingPains'],
    body: [
      "As Eco-Thrift continues to expand, we find ourselves in an exciting yet challenging phase of growth. We're learning to navigate the complexities of becoming a larger company with multiple departments, each with its own unique set of responsibilities and goals. One of our main focuses has been on improving communication and collaboration between these departments to ensure that we're all working together seamlessly towards our common mission. This has involved implementing new systems and processes, providing training and support for our team members, and fostering a culture of open communication and continuous improvement.",
      "Another key aspect of our growth has been our increased focus on advertising and customer communication. We recognize that to truly make an impact, we need to reach a wider audience and engage with our customers in meaningful ways. However, as a startup, we've had to be strategic about where we allocate our limited resources. We've been experimenting with different marketing channels and tactics, tracking our results, and adjusting our approach based on what we learn. It's been a process of trial and error, but we're committed to finding the most effective ways to connect with our customers and share our mission.",
      "As part of our efforts to reach more customers, we've been investing in our website and online sales capabilities. We know that sometimes people prefer the convenience of shopping online, and we want to make sure that we're providing a seamless and enjoyable experience. However, translating the unique Eco-Thrift experience to an online platform has come with its own set of challenges. We've been working hard to improve our website's functionality, streamline our online purchasing process, and find ways to convey the story and mission behind each item we sell. It's an ongoing process, but we're excited about the potential for growth in this area.",
      "One of the core aspects of Eco-Thrift's mission is our commitment to repair and recycling. Our Restoration Department is the heart of this effort, and we've been working to grow and develop this team. We've invested in training and equipment to help our team members become experts in their craft, and we're constantly seeking out new techniques and best practices for restoring and recycling a wide range of items. However, as we've grown, we've also encountered new challenges related to space, workflow, and efficiency. We're currently exploring options for expanding our restoration facilities and optimizing our processes to help us keep up with the increasing demand for our services.",
      "Finally, as we look towards the future and the potential for expanding our business model to include consignment, we recognize the importance of having a solid foundation in place. We've been working hard to perfect our current processes, from intake and processing to sales and customer service. This has involved a lot of analysis, discussion, and refinement, as we seek to identify areas for improvement and implement changes that will help us scale more effectively. At the same time, we're starting to lay the groundwork for our consignment program, researching best practices, and engaging with potential partners and stakeholders. It's a complex undertaking, but we believe that it has the potential to greatly expand our impact and help us achieve our mission on an even larger scale.",
      "At Eco-Thrift, we're committed to being transparent about our journey as a startup and the challenges and opportunities we face along the way. We believe that by inviting our customers into this journey, we can build a stronger, more engaged community around our mission. Together, we can work towards a more sustainable, responsible way of consuming and living. Thank you for being a part of our story.",
    ],
  },
  {
    slug: 'turns-two',
    series: 'Early days',
    title: 'Eco-Thrift Turns Two: A Look Back at Where It All Began',
    excerpt:
      'How Carrie and I went from an empty room on 96th & Q to a store Omaha has welcomed as its own.',
    date: 'November 11, 2023',
    dateIso: '2023-11-11',
    img: '/blog/turns-two.png',
    tags: ['Beginnings'],
    body: [
      'As the CEO of Eco-Thrift, I am proud to introduce you to the company my wife Carrie and I started in June of 2022. When we first received the keys to our retail location on 96th and Q Street, we were faced with an empty space and a peculiar room in the middle. Despite having no inventory or employees, Carrie and I had a clear vision of what we wanted to achieve with Eco-Thrift.',
      'Carrie, with her background as the owner of Dark Horse, an Aveda Hair Salon in Dundee that she has successfully grown over the past 10 years, brings a wealth of experience in business management and customer service. As for myself, I grew up in Omaha and graduated from the University of Nebraska at Omaha with a Math Degree. I spent 10 years working as an Actuary and Data Scientist at Mutual of Omaha, developing a strong analytical skillset and a deep understanding of business operations.',
      'At Eco-Thrift, our mission is to promote the repair, reuse, and recycling of consumer goods, providing an affordable and eco-friendly alternative to traditional retail. By offering gently used household items sourced through consignment and liquidation inventory, we aim to stimulate a circular economy, which is essential for a sustainable future. This approach reduces the need for constantly extracting raw materials to create single-use, disposable items that end up in landfills far too quickly.',
      "When you shop at Eco-Thrift, you'll find a wide variety of carefully selected and restored items at unbeatable prices. Clear tags and fair pricing make it easy to shop with confidence. By choosing to shop with us, you become an integral part of the solution, contributing to a more sustainable and responsible way of consuming goods.",
      'As we continue to expand, Carrie and I remain committed to our core values and are thrilled about the future of Eco-Thrift. Our team has grown to include talented individuals across multiple departments, each playing a crucial role in our mission. In our Restoration department, the magic of restoring and recycling takes place, giving new life to items that might otherwise end up in landfills. Our Processing team meticulously inspects and prepares each item for sale, ensuring that our customers receive quality products. The Retail department creates an inviting and organized shopping experience, making it easy for customers to find the perfect treasure. Our Online Sales and Marketing team works tirelessly to expand our reach and spread the message of sustainable shopping to a wider audience. And with our new Deliveries service, we\'re making eco-friendly shopping more convenient than ever.',
      'With each passing day, we are scaling our operations to make an even greater impact on our community and the environment. We invite you to join us on this exciting journey and become part of the Eco-Thrift family. Together, we can revolutionize the way we consume goods and create a more sustainable future for generations to come. Visit our store or shop online today, and experience the joy and satisfaction of making a positive difference with every purchase.',
    ],
  },
  {
    slug: 'our-vision',
    series: 'Early days',
    title: "Envisioning a Sustainable Future: Eco-Thrift's Ambitious Plans",
    excerpt:
      'Immersive shopping centers, an expanded online presence, and a commitment to community impact.',
    date: 'June 5, 2022',
    dateIso: '2022-06-05',
    img: '/blog/our-vision.webp',
    tags: ['ThinkBig'],
    body: [
      'For Those Who Dare to Think Big:',
      "At Eco-Thrift, we've always believed that big challenges require even bigger dreams. From the day Carrie and I started this journey, we knew that creating a truly sustainable future would demand bold vision, unwavering commitment, and the courage to imagine what others might dismiss as impossible. Now, as we stand at the threshold of a new chapter in our story, we invite you — our loyal customers, our dedicated team members, and our cherished community partners — to dream with us.",
      'As we envision the future of sustainable shopping, one of the most exciting possibilities is the creation of large, in-person shopping centers that seamlessly blend nature and retail. Imagine stepping into a repurposed shopping mall, once abandoned but now thriving with new life. Lush greenery, natural light, and eco-friendly design elements create an inviting atmosphere that celebrates the harmony between consumption and conservation. These centers would serve as immersive hubs for our mission of restoring, repairing, and recycling consumer goods, offering a wide range of sustainable products all under one roof. By partnering with local retailers to divert their liquidation items directly to these centers, we can create a comprehensive and engaging sustainable shopping experience that appeals to everyone. It\'s a vision that encapsulates our commitment to innovation, accessibility, and environmental stewardship, and we\'re thrilled by the potential it holds for revolutionizing the way people shop and think about consumption.',
      "Within these immersive Eco-Thrift shopping centers, customers will discover a rich tapestry of sustainable offerings. As they explore the various sections of the repurposed mall, they'll encounter dedicated spaces for electronics, furniture, clothing, and more, each one showcasing carefully restored and repaired items that have been given a second chance at life. The diverse range of products, spanning different categories and price points, is united by our unwavering commitment to sustainability and waste reduction. Imagine strolling through an Eco-Thrift center and finding a beautifully restored vintage sofa in the furniture section, then wandering over to the electronics area to discover refurbished smartphones and laptops, before browsing a collection of one-of-a-kind, upcycled clothing items. It's a shopping experience that celebrates the value and potential of every item, inviting customers to rethink their relationship with consumption and waste. By creating these engaging, immersive spaces, we aim to revolutionize the way people approach shopping and inspire a new generation of conscious consumers who prioritize sustainability in every aspect of their lives.",
      "Alongside our physical expansion, we also envision a significant growth in our online presence. We aim to become the go-to online resource for repair and replacement parts, leveraging our expertise to help people extend the life of their belongings. Through engaging content on platforms like YouTube and social media, as well as our own website, we'll share our knowledge and empower people to embrace repair and restoration in their own lives. We also plan to offer repair and restoration as a service, allowing customers to bring in their cherished items for a new lease on life.",
      'As Eco-Thrift grows, we envision a future where our commitment to sustainability and community upliftment becomes an integral part of our identity. We believe that the restoration and repair of consumer goods is not just a means to create a cleaner, healthier planet, but also a powerful tool to restore hope and dignity to those facing adversity. In the years to come, we see Eco-Thrift partnering with local organizations to support initiatives that provide resources and opportunities for children in need, help former prisoners successfully re-enter society, aid individuals battling substance abuse, and tackle affordable housing and poverty relief. By dedicating a portion of our profits to these life-changing programs, we aim to create a ripple effect of positive change that extends far beyond our stores. Every item purchased at Eco-Thrift will contribute to both a healthier planet and the transformation of lives in our local communities. This is the inspiring vision that drives us forward, and we invite you to join us in building a future where sustainability and compassion go hand in hand.',
      'We envision Eco-Thrift becoming not just a leader in sustainable retail, but one of the largest and most impactful companies the world has ever seen. As automation and AI continue to transform many industries, we believe that the complex, hands-on work of restoration and repair will remain a vital source of meaningful employment. Eco-Thrift will be a place where people can come to learn valuable skills, contribute to an important mission, and build a brighter future for themselves and their communities.',
      "This is the future we're working towards at Eco-Thrift. It's a future where sustainable shopping is accessible and exciting, where the value of restoration is widely recognized, and where businesses like ours play a leading role in creating a more resilient, compassionate world. We know the journey ahead is long and full of challenges, but with the support of our customers, our team, and our communities, we believe anything is possible. Join us, and let's build this future together.",
      "Does this vision excite you? Do you want to be a part of making it a reality? Here's how you can help:",
      'Shop at Eco-Thrift and experience the joy of sustainable, affordable shopping.',
      'Be patient with us as we grow and provide constructive feedback to help us improve.',
      "If you see potential for partnership or collaboration, reach out to us — we're always eager to work with like-minded individuals and organizations.",
      'Spread the word about Eco-Thrift by leaving positive reviews on Google, Facebook, and other platforms, and don\'t forget to share your favorite finds with friends and family.',
      'Come work at Eco-Thrift!',
      "Your support is the key to turning this vision into a reality, and we can't wait to see what we can achieve together.",
    ],
  },
]
