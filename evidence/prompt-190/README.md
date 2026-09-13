# Prompt 190 visual evidence

The production `DioneVipCards` component was rendered from a temporary isolated Vite fixture with the existing CIC stylesheet. The fixture used the live component and session store shape, while the Firestore listener remained empty so no private card data was fabricated. The temporary fixture source was removed after capture and is not part of the deployable tree.

| viewport | reduced motion | VIP frame | draw control | horizontal overflow |
| --- | --- | --- | --- | --- |
| 320×844 | no | 296×346, right edge 308 | 204×44 | none |
| 1440×900 | no | 1416×251, right edge 1428 | 204×44 | none |
| 844×390 | yes (`prefers-reduced-motion: reduce`) | 820×251, right edge 832 | 204×44 | none |

The three measurements were captured in Chrome through the browser UI/CDP viewport override on 2026-09-12. The rendered copy keeps card identity private, names Prompt 191 as the owner of the printed unrest reroll, and leaves that use action unavailable until its owning prompt lands.
