import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: image().optional(),
	}),
});

const pets = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/pets', pattern: '**/*.json' }),
	// Type-check frontmatter using a schema
	schema: z.object({
		// hardcoded_id: z.number(),
		name: z.string(),
		description: z.string(),
		stack: z.array(z.string()),
		links: z.object({
			github: z.string().url(),
			colab: z.optional(z.string().url()),
			juliahub: z.optional(z.string().url()),
			crates: z.optional(z.string().url()),
			pypi: z.optional(z.string().url()),
			docs: z.optional(z.string().url()),
			plutos : z.optional(z.string().url()),
			guide : z.optional(z.string().url()),
		}),
		dates: z.array(z.string()),
	}),
});

export const collections = { blog, pets };
