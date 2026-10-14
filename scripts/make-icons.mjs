// Renders the app icons (plum tile, cream house with a heart door) to public/icons with Next's
// built-in image renderer. Run: node scripts/make-icons.mjs
import { writeFile } from 'node:fs/promises'
import { ImageResponse } from 'next/og.js'
import { createElement as h } from 'react'

const PLUM = '#7A3E6E'
const CREAM = '#FBF5EA'

// A house outline: roof + walls, and a small door.
const house = (size) =>
  h(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: CREAM, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
    h('path', { d: 'M3 10.5 12 3l9 7.5' }),
    h('path', { d: 'M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5' }),
    h('path', { d: 'M10 21v-5.5a2 2 0 0 1 4 0V21' }),
  )

const tile = (size, { maskable = false } = {}) =>
  h(
    'div',
    {
      style: {
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: PLUM,
        // Maskable icons fill the square (the OS rounds them); keep the glyph inside the 80% safe zone.
        borderRadius: maskable ? 0 : size * 0.22,
      },
    },
    house(Math.round(size * (maskable ? 0.5 : 0.6))),
  )

const render = async (name, size, opts) => {
  const res = new ImageResponse(tile(size, opts), { width: size, height: size })
  await writeFile(`public/icons/${name}`, Buffer.from(await res.arrayBuffer()))
  console.log(`public/icons/${name}`)
}

await render('icon-192.png', 192)
await render('icon-512.png', 512)
await render('maskable-512.png', 512, { maskable: true })
await render('apple-touch-icon.png', 180, { maskable: true }) // iOS rounds it itself
