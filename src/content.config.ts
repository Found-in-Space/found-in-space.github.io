import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const topics = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/topics' }),
	schema: z.object({
		title: z.string(),
		summary: z.string(),
		level: z.enum(['intro', 'intermediate', 'advanced']),
		tags: z.array(z.string()).default([]),
		prerequisites: z.array(z.string()).default([]),
		next_topics: z.array(z.string()).default([]),
		topic_number: z.number(),
		viewer: z.object({
			variant: z.enum(['neighbourhood', 'constellation', 'parsec', 'lightyear']),
			topic: z.string(),
			highlight: z.string().optional(),
			showHr: z.boolean().optional(),
			offsetPc: z.number().optional(),
			maxSpeed: z.number().optional(),
		}),
		viewer_guide: z.string().optional(),
	}),
});

export const collections = { topics };
