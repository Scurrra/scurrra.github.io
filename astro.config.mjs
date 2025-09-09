// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
    site: 'https://scurrra.github.io',
    integrations: [
        mdx(), 
        sitemap({
            customPages: [
                'https://scurrra.github.io/dwarfs',     // Dwarfs notebooks are hosted from `scurrra/dwarfs`
                'https://scurrra.github.io/fossil',     // Fossil.cr docs are hosted from `scurrra/fossil`
            ]
        }),
    ],
});