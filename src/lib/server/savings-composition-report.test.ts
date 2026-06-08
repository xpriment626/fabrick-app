import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCompositionReport } from './savings-composition-report';
import type { AllocationDecision, OpportunityCard } from '$lib/savings/types';

const pools: OpportunityCard[] = [
	{
		id: 'kamino:lend:main-usdc',
		mcpOpportunityId: 'kamino:lend:main-usdc',
		product: 'lend',
		asset: 'USDC',
		title: 'USDC Main Market',
		venue: 'Kamino',
		apy: 0.041,
		tvlUsd: 100_000_000,
		utilizationPct: 62,
		riskTier: 'conservative',
		riskSynthesis: 'Deep USDC lending reserve.',
		isDefault: true,
		depositable: true,
		integrationStatus: 'tx_blueprint_known',
		limitations: [],
		availableFollowups: ['get_metric_packet'],
		refs: { market: 'main', reserve: 'usdc', assetMint: 'EPjFWdd5' }
	},
	{
		id: 'jupiter:earn:usdc',
		mcpOpportunityId: 'jupiter:earn:usdc',
		product: 'earn',
		asset: 'USDC',
		title: 'Jupiter USDC Earn',
		venue: 'Jupiter',
		apy: 0.034,
		tvlUsd: 400_000_000,
		riskTier: 'moderate',
		riskSynthesis: 'Vault exposure with market-data-only connector coverage.',
		isDefault: false,
		depositable: false,
		integrationStatus: 'market_data_only',
		limitations: ['connector provides market and risk data only'],
		availableFollowups: ['compare_opportunities'],
		refs: { vault: 'jup-usdc' }
	}
];

const allocation: AllocationDecision = {
	weights: [
		{
			poolId: 'kamino:lend:main-usdc',
			title: 'USDC Main Market',
			product: 'lend',
			asset: 'USDC',
			weightPct: 70,
			apy: 0.041
		},
		{
			poolId: 'jupiter:earn:usdc',
			title: 'Jupiter USDC Earn',
			product: 'earn',
			asset: 'USDC',
			weightPct: 30,
			apy: 0.034
		}
	],
	blendedApyPct: 3.89,
	riskEnvelope: 'Conservative USDC savings exposure',
	rebalanceStrategy: 'Review on catalogue refresh.',
	rationale: 'Diversified across selected USDC pools.'
};

test('buildCompositionReport creates validated chart data from selected pools and weights', () => {
	const report = buildCompositionReport({
		accountName: 'Vacation',
		allocation,
		amountUsd: 1000,
		pools,
		riskPreference: 'balanced'
	});

	assert.equal(report.accountName, 'Vacation');
	assert.equal(report.summary.blendedApyPct, 3.89);
	assert.equal(report.summary.previewOnly, true);
	assert.equal(report.pools[0]?.amountUsd, 700);
	assert.equal(report.pools[0]?.apyContributionPct, 2.87);
	assert.equal(report.pools[1]?.integrationStatus, 'market_data_only');
	assert.match(report.keyWarnings.join(' '), /analysis-only/);
	assert.equal(report.chartData.weights.length, 2);
	assert.equal(report.findings.length, 6);
	assert.equal(report.coordination.runtime, 'local_schema');
});

test('buildCompositionReport records reroll deltas against the previous allocation', () => {
	const previousAllocation: AllocationDecision = {
		...allocation,
		blendedApyPct: 3.7,
		weights: [
			{ ...allocation.weights[0]!, weightPct: 50 },
			{ ...allocation.weights[1]!, weightPct: 50 }
		]
	};

	const report = buildCompositionReport({
		allocation,
		amountUsd: 1000,
		pools,
		previousAllocation,
		riskPreference: 'balanced'
	});

	assert.equal(report.delta.kind, 'reroll');
	assert.equal(report.delta.blendedApyDeltaPct, 0.19);
	assert.deepEqual(
		report.delta.weightChanges.map((change) => [change.poolId, change.deltaPct]),
		[
			['kamino:lend:main-usdc', 20],
			['jupiter:earn:usdc', -20]
		]
	);
});

test('buildCompositionReport overlays parsed Coral specialist output', () => {
	const report = buildCompositionReport({
		allocation,
		amountUsd: 1000,
		agentOutput: {
			narratorCopy: {
				overview: 'Specialists agree the selected pools make sense as a preview-only mix.',
				weightingRationale: 'Agent-reviewed weighting leans toward deeper lending exposure.',
				rebalancing: 'Review if rate quality or exit liquidity changes.'
			},
			keyWarnings: ['Agent warning: Jupiter USDC Earn remains market-data-only in Fabrick.'],
			findings: [
				{
					specialist: 'rate',
					title: 'Agent rate quality',
					severity: 'watch',
					body: 'The APY should be treated as current-only until more historical samples are available.'
				}
			]
		},
		coordination: {
			runtime: 'coral_cloud',
			status: 'completed',
			namespace: 'fabrick-composition-report-test',
			sessionId: 'session-test'
		},
		pools,
		riskPreference: 'balanced'
	});

	assert.equal(report.narratorCopy.overview, 'Specialists agree the selected pools make sense as a preview-only mix.');
	assert.equal(report.coordination.status, 'completed');
	assert.equal(report.findings.find((finding) => finding.specialist === 'rate')?.title, 'Agent rate quality');
	assert.match(report.keyWarnings.join(' '), /Agent warning/);
	assert.equal(report.findings.length, 6);
});

test('buildCompositionReport bounds structured agent copy and warnings', () => {
	const longWarning =
		'Narrator synthesis: Smoke workflow: you will receive fixed selected pools and a long list of selected opportunity ids including kamino:lend:Atj6UREVVwa7WxbF2EMKNyfmYUY1U1txughe2gjhcPDCo and kamino:lend:BnYNV7TdhwASUab7mQCRhzHvasjp8o8xmmvVtKnPe3Zi. This raw coordination text should not overwhelm the warnings card or create horizontal overflow in the report UI.';
	const report = buildCompositionReport({
		allocation,
		amountUsd: 1000,
		agentOutput: {
			narratorCopy: {
				overview:
					'This is a deliberately long narrator overview that should be clipped into report-sized copy. It includes enough sentence structure to cut cleanly. It should not expand the header indefinitely or overflow the composition report card in narrow layouts.',
				weightingRationale:
					'This is a long weighting rationale. It should be useful, compact, and clipped before it becomes a pasted transcript.',
				rebalancing:
					'This is a long rebalancing explanation. It should be clipped before it becomes a pasted transcript.'
			},
			keyWarnings: [longWarning],
			findings: [
				{
					specialist: 'capacity',
					title:
						'Capacity and concentration with a title that is far too long for a compact finding card and should be shortened',
					severity: 'watch',
					body: longWarning
				}
			]
		},
		pools,
		riskPreference: 'balanced'
	});

	assert.ok(report.keyWarnings[0]!.length <= 263);
	assert.doesNotMatch(report.keyWarnings[0]!, /Atj6UREV/);
	assert.ok(report.findings.find((finding) => finding.specialist === 'capacity')!.title.length <= 75);
	assert.ok(report.findings.find((finding) => finding.specialist === 'capacity')!.body.length <= 423);
	assert.ok(report.narratorCopy.overview.length <= 363);
});
