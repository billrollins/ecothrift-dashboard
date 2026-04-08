"""Seed CategoryMapping rows for common fast_cat_key values (Phase 4.1A)."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.models import CategoryMapping

# Amazon (38 keys) — consultant-reviewed
_AMZ_SEED: dict[str, str] = {
    'amz-accessories-guitar-accessories': 'Toys & games',
    'amz-accessories-guitar-strings': 'Toys & games',
    'amz-accessories-percussion-accessories': 'Toys & games',
    'amz-action-figures-and-collectibles-accessories': 'Toys & games',
    'amz-action-figures-and-collectibles-figures': 'Toys & games',
    'amz-arts-crafts-supplies': 'Toys & games',
    'amz-baby-bedding-nursery-blankets': 'Baby & kids',
    'amz-baby-bedding-summer-swaddle-blankets-sleep-bags': 'Baby & kids',
    'amz-baby-bedding-winter-swaddle-blankets-sleep-bags': 'Baby & kids',
    'amz-baby-product-baby-product': 'Baby & kids',
    'amz-care-safety-healthcare': 'Baby & kids',
    'amz-care-safety-household-safety': 'Baby & kids',
    'amz-diapering-cloth-diapers': 'Baby & kids',
    'amz-dolls-toys-all-other-dolls': 'Toys & games',
    'amz-dolls-toys-fashion-dolls-accessories': 'Toys & games',
    'amz-feeding-bibs-burp-cloths': 'Baby & kids',
    'amz-feeding-bottles-and-nipples': 'Baby & kids',
    'amz-games-board-games': 'Toys & games',
    'amz-games-card-games': 'Toys & games',
    'amz-gifts-gift-sets': 'Party, seasonal & novelty',
    'amz-hobby-accessories-tools': 'Toys & games',
    'amz-infant-preschool-infant-toys': 'Toys & games',
    'amz-infant-toys-bath-toys': 'Toys & games',
    'amz-learning-technology-other': 'Toys & games',
    'amz-musical-instruments-musical-instruments': 'Toys & games',
    'amz-novelty-party-supplies-costume-dress-up-halloween-costumes-acc': 'Party, seasonal & novelty',
    'amz-novelty-party-supplies-costume-dress-up-other-novelty': 'Party, seasonal & novelty',
    'amz-novelty-party-supplies-costume-dress-up-party-decorations': 'Party, seasonal & novelty',
    'amz-novelty-party-supplies-costume-dress-up-party-supplies': 'Party, seasonal & novelty',
    'amz-outdoor-sports-toys-pool-water': 'Toys & games',
    'amz-outdoor-sports-toys-sports-activities-games': 'Toys & games',
    'amz-outdoor-sports-toys-water-guns': 'Toys & games',
    'amz-plush-basic-plush': 'Toys & games',
    'amz-puzzles-jigsaw-puzzles': 'Toys & games',
    'amz-ride-ons-battery-operated': 'Toys & games',
    'amz-strollers-stroller-accessories': 'Baby & kids',
    'amz-toy-toy': 'Toys & games',
    'amz-vehicles-die-cast': 'Toys & games',
}

# Target (273 keys) — beauty CSV fast_cat_key values → Health, beauty & personal care
_TGT_SEED: dict[str, str] = {
    'tgt-cosmetics-nail-care-ardell-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-blush-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-brow-pen-liner-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-clio-designs-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-colourpop-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-compact-makeup-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-concealer-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-cotton-balls-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-cream-makeup-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-dashing-diva-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-essence-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-eye-combo-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-eye-pen-liner-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-eye-pens-liquid-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-eye-shadow-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-eylure-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-face-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-face-primer-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-flawless-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-habit-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-highlighter-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-house-of-lashes-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-illume-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-japonesque-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-kiss-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-kyutee-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-la-girl-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-le-mini-macaron-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-lip-balm-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-lip-bar-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-lip-gloss-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-lip-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-lip-pen-liner-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-lipstick-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-liquid-makeup-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-mascara-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-mayb-essie-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-mented-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-milani-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-mixbar-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-morphe-2-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-no7-skincare-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-organization-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-pacifica-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-physicians-formula-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-pink-lipps-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-pixi-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-plano-caboodles-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-pressed-powder-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-radiant-brushes-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-sally-hansen-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-sigma-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-skincare-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-smackers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-tbc-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-tenoverten-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-trim-implements-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-w3ll-people-health-and-beauty': 'Health, beauty & personal care',
    'tgt-cosmetics-nail-care-winky-lux-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-accessories-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-ammonia-fr-bx-perm-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-ammonia-fr-bx-semi-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-aquis-home': 'Health, beauty & personal care',
    'tgt-hair-care-aussie-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-aussie-kids-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-aveeno-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-batiste-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-biosilk-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-biotera-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-boxed-permanent-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-braids-weaves-th-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-brushes-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-chi-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-cleanser-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-clips-pins-barrett-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-color-dpsit-sh-cnd-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-color-maintenance-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-color-remover-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-conditioner-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-curl-enhancer-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-curling-iron-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-dove-beauty-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-elements-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-ethnic-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-eva-nyc-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-fairy-tales-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-finishing-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-free-clear-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-frizz-ease-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-fructis-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-function-of-beauty-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-gel-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-gloss-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-grooming-accessori-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-hair-biology-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-hair-dryer-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-hair-extensions-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-hair-ties-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-head-shoulders-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-headwear-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-herbal-essences-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-high-ridge-brands-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-its-a-10-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-john-frieda-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-kids-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-kristin-ess-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-l-39oreal-paris-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-leave-in-condition-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-loreal-elvive-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-love-beauty-planet-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-michiru-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-mini-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-nexxus-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-nioxin-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-nizoral-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-ogx-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-oil-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-old-spice-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-online-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-open30-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-pacifica-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-pantene-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-paul-mitchell-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-puracy-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-purezero-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-raw-sugar-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-renpure-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-rhyme-amp-reason-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-saltair-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-semi-perm-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-semi-perm-rtu-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-sexy-hair-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-shamp-cond-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-shower-accessories-home': 'Health, beauty & personal care',
    'tgt-hair-care-sleep-accessories-home': 'Health, beauty & personal care',
    'tgt-hair-care-specialty-styling-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-stylers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-suave-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-sunbum-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-temp-root-touch-up-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-tigi-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-treatment-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-trend-foam-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-trend-semi-perm-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-tresemme-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-unilever-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-up-up-health-and-beauty': 'Health, beauty & personal care',
    'tgt-hair-care-urban-hydration-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-assortment-laundry-cleaning-and-closet': 'Health, beauty & personal care',
    'tgt-personal-care-body-wash-female-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-body-wash-male-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-body-wash-trial-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-childrens-tpaste-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-f-core-stick-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-f-natural-niche-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-f-natural-nicheoth-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-m-core-stick-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-m-natural-niche-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-male-skin-care-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-men-razors-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-mens-carts-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-mens-shavers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-picks-flossers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-shampoo-cond-2in1-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-specialty-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-tooth-elec-brushes-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-tooth-flossers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-tooth-repl-heads-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-toothbrush-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-toothpaste-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-travel-kit-apparel': 'Health, beauty & personal care',
    'tgt-personal-care-trimmers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-wmns-carts-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-womens-preps-health-and-beauty': 'Health, beauty & personal care',
    'tgt-personal-care-womens-shavers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-accessory-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-acure-organics-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-alba-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-all-good-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-amlactin-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-apto-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-aquaphor-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-art-naturals-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-australian-gold-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-avatara-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-aveeno-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-baebody-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-banana-boat-basic-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-bare-republic-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-bath-bomb-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-being-frenshe-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-bio-oil-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-bliss-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-bondi-sands-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-burts-bees-body-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-burts-bees-face-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-burts-bees-lip-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-byoma-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-cerave-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-cetaphil-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-clean-clear-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-cocokind-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-coppertone-basic-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-curel-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-curology-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-da-bomb-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-derma-e-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-dr-bronners-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-dr-teals-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-eos-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-ferver-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-fragnance-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-galderma-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-gold-bond-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-good-patch-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-goop-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-hawaiian-trop-basi-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-hempz-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-hero-cosmetics-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-honest-co-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-indeed-labs-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-islander-group-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-jergens-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-la-roche-posay-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-loreal-basic-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-loreal-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-lotions-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-love-beauty-planet-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-love-wellness-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-lubriderm-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-masks-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-naked-sundays-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-natural-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-naturium-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-neutrogena-basic-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-neutrogena-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-nivea-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-olay-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-olly-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-other-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-other-home': 'Health, beauty & personal care',
    'tgt-skin-bath-care-pacifica-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-plum-beauty-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-proactiv-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-rae-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-rael-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-raw-elements-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-roc-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-salts-soaks-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-scrubs-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-shea-moisture-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-sol-by-jergens-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-solara-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-spa-sciences-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-sugarbear-hair-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-sun-bum-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-sunless-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-sunscreen-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-sunwink-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-tanologist-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-teami-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-thayers-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-undefined-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-unsun-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-up-up-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-versed-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-vital-proteins-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-washes-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-weleda-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-welly-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-wldkat-health-and-beauty': 'Health, beauty & personal care',
    'tgt-skin-bath-care-zitsticka-health-and-beauty': 'Health, beauty & personal care',
}


# Walmart (32 keys) — consultant-reviewed
_WAL_SEED: dict[str, str] = {
    'wal-1-hour-photo': 'Electronics',
    'wal-automotive': 'Tools & hardware',
    'wal-bath-and-shower': 'Health, beauty & personal care',
    'wal-bedding': 'Bedding & bath',
    'wal-celebration': 'Party, seasonal & novelty',
    'wal-chemicals-cleaning-supplies': 'Household & cleaning',
    'wal-cooking-and-dining': 'Kitchen & dining',
    'wal-fabrics-crafts': 'Toys & games',
    'wal-furniture-luggage': 'Furniture',
    'wal-hardware': 'Tools & hardware',
    'wal-home-decor': 'Home décor & lighting',
    'wal-home-management': 'Storage & organization',
    'wal-household-paper-goods': 'Household & cleaning',
    'wal-impulse-merchandise': 'Mixed lots & uncategorized',
    'wal-infant-consumable-hardlines': 'Baby & kids',
    'wal-jewelry-sunglasses': 'Apparel & accessories',
    'wal-ladies-accessories-handbags': 'Apparel & accessories',
    'wal-media-and-gaming': 'Books & media',
    'wal-mens-wear': 'Apparel & accessories',
    'wal-oil': 'Tools & hardware',
    'wal-outdoor-living': 'Outdoor & patio furniture',
    'wal-paint-accessories': 'Tools & hardware',
    'wal-personal-care': 'Health, beauty & personal care',
    'wal-pets-supplies': 'Pet supplies',
    'wal-pharmacy': 'Health, beauty & personal care',
    'wal-seasonal': 'Party, seasonal & novelty',
    'wal-sporting-goods': 'Sports & outdoors',
    'wal-stationery': 'Office & school supplies',
    'wal-supplies': 'Office & school supplies',
    'wal-toys-and-bikes': 'Toys & games',
    'wal-tvs-consumer-electronics': 'Electronics',
    'wal-wireless': 'Electronics',
}


def build_fast_cat_seed() -> dict[str, str]:
    """343 keys: 38 Amazon + 273 Target + 32 Walmart."""
    return {**_AMZ_SEED, **_TGT_SEED, **_WAL_SEED}


FAST_CAT_SEED: dict[str, str] = build_fast_cat_seed()


class Command(BaseCommand):
    help = (
        'Upsert CategoryMapping rows for fast_cat_key strings. '
        'Source: static AMZ / TGT / WAL seed dicts in this module.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--force',
            action='store_true',
            help='Allow when DEBUG is False.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print keys that would be written; no DB writes.',
        )

    def handle(self, *args, **options) -> None:
        force = options['force']
        dry_run = options['dry_run']
        if not getattr(settings, 'DEBUG', False) and not force:
            raise CommandError('Refusing to seed: DEBUG is False. Pass --force.')

        seed = build_fast_cat_seed()
        if len(seed) != 343:
            self.stdout.write(
                self.style.WARNING(
                    f'Expected 343 fast_cat keys, got {len(seed)}. '
                    f'Check AMZ / TGT / WAL seed dicts in this module.'
                )
            )

        if not seed:
            self.stdout.write(
                self.style.WARNING(
                    'FAST_CAT_SEED is empty. Fix AMZ / TGT / WAL seed dicts in this module.'
                )
            )
            return

        if dry_run:
            for sk, cat in sorted(seed.items()):
                self.stdout.write(f'{sk!r} → {cat!r}')
            self.stdout.write(self.style.SUCCESS(f'Dry run: {len(seed)} mapping(s).'))
            return

        created = 0
        updated = 0
        for source_key, canonical_category in seed.items():
            sk = source_key.strip()
            _obj, was_created = CategoryMapping.objects.update_or_create(
                source_key=sk,
                defaults={
                    'canonical_category': canonical_category,
                    'rule_origin': CategoryMapping.RULE_SEEDED,
                    'ai_reasoning': '',
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. CategoryMapping: {created} created, {updated} updated '
                f'({created + updated} total).'
            )
        )
