import { compositionReportSchema } from '$lib/savings/report';
import type {
	AllocationDecision,
	AllocationWeight,
	CompositionReport,
	CompositionReportDelta,
	CompositionReportFinding,
	CompositionReportPool,
	OpportunityCard,
	RiskPreference
} from '$lib/savings/types';

const RISK_ORDINAL: Record<OpportunityCard['riskTier'], number> = {
	conservative: 1,
	moderate: 2,
	elevated: 3,
	high: 4
};

const RISK_LABEL: Record<RiskPreference, string> = {
	conservative: 'capital preservation first',
	balanced: 'balanced yield and liquidity',
	aggressive: 'yield-seeking within selected pools'
};

export type BuildCompositionReportInput = {
	accountName?: string;
	allocation: AllocationDecision;
	amountUsd: number;
	pools: OpportunityCard[];
	previousAllocation?: AllocationDecision | null;
	riskPreference: RiskPreference;
	coordination?: CompositionReport['coordination'];
	agentOutput?: CompositionReportAgentOutput;
};

export type CompositionReportAgentOutput = {
	findings?: CompositionReportFinding[];
	keyWarnings?: string[];
	narratorCopy?: Partial<CompositionReport['narratorCopy']>;
};

function round(value: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function byPoolId(pools: OpportunityCard[]): Map<string, OpportunityCard> {
	return new Map(pools.map((pool) => [pool.id, pool]));
}

function capabilities(pool: OpportunityCard): string[] {
	const caps = ['market data', 'risk data'];
	if (pool.depositable) caps.push('deposit path known');
	if (pool.integrationStatus === 'simulation_supported') caps.push('simulation supported');
	if (pool.integrationStatus === 'execution_supported') caps.push('execution supported');
	return caps;
}

function poolAmount(amountUsd: number, weightPct: number): number {
	return round((amountUsd * weightPct) / 100, 2);
}

function buildPoolRows(input: BuildCompositionReportInput): CompositionReportPool[] {
	const poolsById = byPoolId(input.pools);
	return input.allocation.weights.map((weight) => {
		const pool = poolsById.get(weight.poolId);
		const riskTier = pool?.riskTier ?? 'moderate';
		const amountUsd = poolAmount(input.amountUsd, weight.weightPct);
		const tvlUsd = pool?.tvlUsd && pool.tvlUsd > 0 ? pool.tvlUsd : 0;
		return {
			poolId: weight.poolId,
			title: weight.title,
			venue: pool?.venue ?? 'Unknown venue',
			product: weight.product,
			riskTier,
			integrationStatus: pool?.integrationStatus ?? 'market_data_only',
			weightPct: round(weight.weightPct, 1),
			amountUsd,
			apyPct: round(weight.apy * 100, 2),
			apyContributionPct: round((weight.weightPct / 100) * weight.apy * 100, 2),
			riskContribution: round((weight.weightPct / 100) * RISK_ORDINAL[riskTier], 2),
			depthBps: tvlUsd > 0 ? round((amountUsd / tvlUsd) * 10_000, 4) : 0,
			capabilities: pool ? capabilities(pool) : [],
			limitations: pool?.limitations ?? []
		};
	});
}

function topRiskPool(pools: CompositionReportPool[]): CompositionReportPool {
	return [...pools].sort(
		(a, b) =>
			RISK_ORDINAL[b.riskTier] * b.weightPct - RISK_ORDINAL[a.riskTier] * a.weightPct ||
			b.weightPct - a.weightPct
	)[0]!;
}

function buildDelta(
	allocation: AllocationDecision,
	previousAllocation: AllocationDecision | null | undefined
): CompositionReportDelta {
	if (!previousAllocation) {
		return {
			kind: 'initial',
			blendedApyDeltaPct: 0,
			weightChanges: allocation.weights.map((weight) => ({
				poolId: weight.poolId,
				title: weight.title,
				beforePct: 0,
				afterPct: round(weight.weightPct, 1),
				deltaPct: round(weight.weightPct, 1)
			}))
		};
	}

	const previousById = new Map(previousAllocation.weights.map((weight) => [weight.poolId, weight]));
	const currentById = new Map(allocation.weights.map((weight) => [weight.poolId, weight]));
	const ids = new Set([...previousById.keys(), ...currentById.keys()]);
	const weightChanges = [...ids]
		.map((poolId) => {
			const before = previousById.get(poolId);
			const after = currentById.get(poolId);
			const beforePct = round(before?.weightPct ?? 0, 1);
			const afterPct = round(after?.weightPct ?? 0, 1);
			return {
				poolId,
				title: after?.title ?? before?.title ?? poolId,
				beforePct,
				afterPct,
				deltaPct: round(afterPct - beforePct, 1)
			};
		})
		.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

	return {
		kind: 'reroll',
		blendedApyDeltaPct: round(allocation.blendedApyPct - previousAllocation.blendedApyPct, 2),
		weightChanges
	};
}

function buildWarnings(pools: CompositionReportPool[]): string[] {
	const warnings = new Set<string>();
	for (const pool of pools) {
		if (pool.integrationStatus === 'market_data_only') {
			warnings.add(`${pool.title} is analysis-only in Fabrick right now.`);
		}
		if (pool.riskTier === 'high' && pool.weightPct >= 10) {
			warnings.add(`${pool.title} carries high-risk exposure at ${pool.weightPct.toFixed(1)}%.`);
		}
		if (pool.limitations.length) {
			warnings.add(`${pool.title}: ${pool.limitations[0]}`);
		}
	}
	return [...warnings].slice(0, 4);
}

function buildFindings(
	rows: CompositionReportPool[],
	allocation: AllocationDecision,
	riskPreference: RiskPreference
): CompositionReportFinding[] {
	const topWeight = [...rows].sort((a, b) => b.weightPct - a.weightPct)[0]!;
	const riskiest = topRiskPool(rows);
	const marketDataOnly = rows.filter((pool) => pool.integrationStatus === 'market_data_only');
	const maxDepth = [...rows].sort((a, b) => b.depthBps - a.depthBps)[0]!;

	return [
		{
			specialist: 'opportunity',
			title: 'Selected pool set',
			severity: marketDataOnly.length ? 'watch' : 'info',
			body: `${rows.length} user-selected USDC opportunities are included. ${marketDataOnly.length ? `${marketDataOnly.length} are market-data-only in Fabrick today.` : 'All selected rows have app-recognized connector coverage.'}`
		},
		{
			specialist: 'rate',
			title: 'Rate contribution',
			severity: 'info',
			body: `${topWeight.title} is the largest sleeve at ${topWeight.weightPct.toFixed(1)}%, while the blended APY preview is ${allocation.blendedApyPct.toFixed(2)}%.`
		},
		{
			specialist: 'liquidity',
			title: 'Deposit depth',
			severity: maxDepth.depthBps > 25 ? 'watch' : 'info',
			body: `${maxDepth.title} has the largest deposit-to-TVL footprint at ${maxDepth.depthBps.toFixed(4)} bps for this preview amount.`
		},
		{
			specialist: 'capacity',
			title: 'Concentration',
			severity: topWeight.weightPct >= 60 ? 'watch' : 'info',
			body: `Largest target weight is ${topWeight.weightPct.toFixed(1)}% in ${topWeight.title}; this is the main concentration point.`
		},
		{
			specialist: 'exposure',
			title: 'Exposure class',
			severity: riskiest.riskTier === 'high' ? 'warning' : 'info',
			body: `${riskiest.title} contributes the most risk-adjusted exposure and is classified as ${riskiest.product === 'lend' ? 'lending reserve exposure' : 'vault or strategy exposure'}.`
		},
		{
			specialist: 'narrator',
			title: 'Preview boundary',
			severity: 'info',
			body: `This report explains a ${RISK_LABEL[riskPreference]} preview. It does not prepare, sign, or submit any transaction.`
		}
	];
}

function buildChartData(rows: CompositionReportPool[]): CompositionReport['chartData'] {
	return {
		weights: rows.map((pool) => ({ label: pool.title, valuePct: pool.weightPct })),
		apyContribution: rows.map((pool) => ({
			label: pool.title,
			valuePct: pool.apyContributionPct
		})),
		riskContribution: rows.map((pool) => ({
			label: pool.title,
			value: pool.riskContribution
		})),
		depositDepth: rows.map((pool) => ({
			label: pool.title,
			valueBps: pool.depthBps
		}))
	};
}

function compactReportText(value: string, maxLength: number): string {
	const cleaned = value
		.replace(/\s+/g, ' ')
		.replace(/\b(?:kamino|save|jupiter):[A-Za-z0-9:_-]{18,}\b/g, 'selected opportunity')
		.replace(/\s+([,.;:])/g, '$1')
		.trim();
	if (cleaned.length <= maxLength) return cleaned;
	const sentenceEnd = Math.max(
		cleaned.lastIndexOf('. ', maxLength),
		cleaned.lastIndexOf('; ', maxLength),
		cleaned.lastIndexOf('? ', maxLength),
		cleaned.lastIndexOf('! ', maxLength)
	);
	const cut = sentenceEnd > maxLength * 0.55 ? sentenceEnd + 1 : cleaned.lastIndexOf(' ', maxLength);
	return `${cleaned.slice(0, cut > 0 ? cut : maxLength).trim()}...`;
}

function cleanFinding(finding: CompositionReportFinding): CompositionReportFinding {
	return {
		...finding,
		title: compactReportText(finding.title, 72),
		body: compactReportText(finding.body, 420)
	};
}

function mergeFindings(
	fallback: CompositionReportFinding[],
	agentFindings: CompositionReportFinding[] | undefined
): CompositionReportFinding[] {
	if (!agentFindings?.length) return fallback;
	const bySpecialist = new Map<CompositionReportFinding['specialist'], CompositionReportFinding>();
	for (const finding of fallback) bySpecialist.set(finding.specialist, cleanFinding(finding));
	for (const finding of agentFindings) bySpecialist.set(finding.specialist, cleanFinding(finding));
	return [...bySpecialist.values()];
}

function mergeWarnings(fallback: string[], agentWarnings: string[] | undefined): string[] {
	const warnings = new Set<string>();
	for (const warning of agentWarnings ?? []) {
		if (warning.trim()) warnings.add(compactReportText(warning, 260));
	}
	for (const warning of fallback) warnings.add(compactReportText(warning, 260));
	return [...warnings].slice(0, 6);
}

export function buildCompositionReport(input: BuildCompositionReportInput): CompositionReport {
	const pools = buildPoolRows(input);
	const warnings = buildWarnings(pools);
	const riskiest = topRiskPool(pools);
	const delta = buildDelta(input.allocation, input.previousAllocation);
	const fallbackFindings = buildFindings(pools, input.allocation, input.riskPreference);
	const agentNarrator = input.agentOutput?.narratorCopy;
	const report: CompositionReport = {
		id: `composition-${Date.now()}`,
		generatedAt: new Date().toISOString(),
		accountName: input.accountName,
		amountUsd: input.amountUsd,
		riskPreference: input.riskPreference,
		summary: {
			headline: `${input.riskPreference[0].toUpperCase()}${input.riskPreference.slice(1)} Advanced USDC mix`,
			blendedApyPct: input.allocation.blendedApyPct,
			poolCount: pools.length,
			primaryRisk: `${riskiest.title} is the largest risk contributor.`,
			previewOnly: true
		},
		narratorCopy: {
			overview: agentNarrator?.overview?.trim()
				? compactReportText(agentNarrator.overview, 360)
				: input.allocation.rationale,
			weightingRationale:
				(agentNarrator?.weightingRationale?.trim()
					? compactReportText(agentNarrator.weightingRationale, 320)
					: '') ||
				`Weights are applied only across the pools the user selected, then rendered into a ${RISK_LABEL[input.riskPreference]} composition.`,
			rebalancing: agentNarrator?.rebalancing?.trim()
				? compactReportText(agentNarrator.rebalancing, 320)
				: input.allocation.rebalanceStrategy
		},
		pools,
		findings: mergeFindings(fallbackFindings, input.agentOutput?.findings),
		keyWarnings: mergeWarnings(warnings, input.agentOutput?.keyWarnings),
		chartData: buildChartData(pools),
		delta,
		coordination: input.coordination ?? {
			runtime: 'local_schema',
			status: 'unavailable',
			message: 'Rendered from validated Savings MCP allocation data without a Coral report session.'
		}
	};

	return compositionReportSchema.parse(report);
}

export function weightByPoolId(weights: AllocationWeight[]): Map<string, AllocationWeight> {
	return new Map(weights.map((weight) => [weight.poolId, weight]));
}
