import { z } from 'zod';

export const compositionReportFindingSchema = z.object({
	specialist: z.enum(['opportunity', 'rate', 'liquidity', 'capacity', 'exposure', 'narrator']),
	title: z.string().min(1),
	severity: z.enum(['info', 'watch', 'warning']),
	body: z.string().min(1)
});

export const compositionReportPoolSchema = z.object({
	poolId: z.string().min(1),
	title: z.string().min(1),
	venue: z.string().min(1),
	product: z.enum(['lend', 'earn']),
	riskTier: z.enum(['conservative', 'moderate', 'elevated', 'high']),
	integrationStatus: z.enum([
		'market_data_only',
		'tx_blueprint_known',
		'simulation_supported',
		'execution_supported'
	]),
	weightPct: z.number().min(0).max(100),
	amountUsd: z.number().min(0),
	apyPct: z.number(),
	apyContributionPct: z.number(),
	riskContribution: z.number().min(0),
	depthBps: z.number().min(0),
	capabilities: z.array(z.string()),
	limitations: z.array(z.string())
});

export const compositionReportDeltaSchema = z.object({
	kind: z.enum(['initial', 'reroll']),
	blendedApyDeltaPct: z.number(),
	weightChanges: z.array(
		z.object({
			poolId: z.string().min(1),
			title: z.string().min(1),
			beforePct: z.number().min(0).max(100),
			afterPct: z.number().min(0).max(100),
			deltaPct: z.number().min(-100).max(100)
		})
	)
});

export const compositionReportSchema = z.object({
	id: z.string().min(1),
	generatedAt: z.string().min(1),
	accountName: z.string().optional(),
	amountUsd: z.number().positive(),
	riskPreference: z.enum(['conservative', 'balanced', 'aggressive']),
	summary: z.object({
		headline: z.string().min(1),
		blendedApyPct: z.number(),
		poolCount: z.number().int().positive(),
		primaryRisk: z.string().min(1),
		previewOnly: z.literal(true)
	}),
	narratorCopy: z.object({
		overview: z.string().min(1),
		weightingRationale: z.string().min(1),
		rebalancing: z.string().min(1)
	}),
	pools: z.array(compositionReportPoolSchema).min(1),
	findings: z.array(compositionReportFindingSchema).min(1),
	keyWarnings: z.array(z.string()),
	chartData: z.object({
		weights: z.array(z.object({ label: z.string().min(1), valuePct: z.number().min(0) })),
		apyContribution: z.array(z.object({ label: z.string().min(1), valuePct: z.number().min(0) })),
		riskContribution: z.array(z.object({ label: z.string().min(1), value: z.number().min(0) })),
		depositDepth: z.array(z.object({ label: z.string().min(1), valueBps: z.number().min(0) }))
	}),
	delta: compositionReportDeltaSchema,
	coordination: z.object({
		runtime: z.enum(['coral_cloud', 'local_schema']),
		status: z.enum(['completed', 'session_created', 'unavailable']),
		namespace: z.string().optional(),
		sessionId: z.string().optional(),
		message: z.string().optional()
	})
});

export type CompositionReportSchema = z.infer<typeof compositionReportSchema>;

export function parseCompositionReport(value: unknown): CompositionReportSchema | null {
	const parsed = compositionReportSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}
