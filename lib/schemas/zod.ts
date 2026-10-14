// The one place zod is imported from. jitless: zod 4 otherwise probes for eval support with
// `Function('')` on first parse, which the page Content-Security-Policy reports (T52, ARCHITECTURE §5.4).

import { z } from 'zod'

z.config({ jitless: true })

export { z }
