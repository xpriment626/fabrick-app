import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
	mapMcpAllocationToDecision,
	mapMcpCatalogueToSavingsCatalogue
} from './savings-mcp';

describe('Savings MCP adapter', () => {
	it('maps structured MCP opportunities into a USDC-only catalogue', () => {
		const catalogue = mapMcpCatalogueToSavingsCatalogue({
			generated_at: '2026-06-07T00:00:00.000Z',
			opportunities: [
				{
					id: 'kamino:lend:main-usdc',
					venue: 'Kamino',
					protocol: 'kamino',
					product_type: 'lending_reserve',
					title: 'USDC Main Market',
					asset: {
						symbol: 'USDC',
						mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
						principal: 'canonical_solana_usdc'
					},
					apy: { current: 0.041, source: 'fixture', window: 'current' },
					tvl: { usd: 100_000_000 },
					liquidity: { utilizationPct: 62, withdrawalBufferPct: 38 },
					risk: {
						tier: 'conservative',
						score: 18,
						factors: ['main market'],
						synthesis: 'Deep USDC lending market.'
					},
					capabilities: {
						marketData: true,
						riskData: true,
						depositTxKnown: true,
						simulationSupported: false,
						executionSupported: false
					},
					integrationStatus: 'tx_blueprint_known',
					limitations: [],
					refs: {
						market: 'main-market',
						reserve: 'main-usdc-reserve',
						assetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
					},
					display: {
						displayTitle: 'USDC Main Market',
						headlineApyPct: 4.1,
						riskBadge: 'conservative risk',
						liquidityBadge: '38% buffer',
						status: 'tx_blueprint_known',
						primaryWarnings: [],
						availableFollowups: ['get_metric_packet']
					}
				},
				{
					id: 'jupiter:earn:usdc',
					venue: 'Jupiter Lend',
					protocol: 'jupiter',
					product_type: 'vault',
					title: 'Jupiter USDC Earn',
					asset: {
						symbol: 'USDC',
						mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
						principal: 'canonical_solana_usdc'
					},
					apy: { current: 0.034, source: 'fixture', window: 'current' },
					tvl: { usd: 400_000_000 },
					liquidity: { utilizationPct: null, withdrawalBufferPct: 30 },
					risk: {
						tier: 'moderate',
						score: 34,
						factors: ['market data only'],
						synthesis: 'Visible to analysis; app deposit path not wired.'
					},
					capabilities: {
						marketData: true,
						riskData: true,
						depositTxKnown: false,
						simulationSupported: false,
						executionSupported: false
					},
					integrationStatus: 'market_data_only',
					limitations: ['connector provides market and risk data only'],
					refs: {},
					display: {
						displayTitle: 'Jupiter USDC Earn',
						headlineApyPct: 3.4,
						riskBadge: 'moderate risk',
						liquidityBadge: '30% buffer',
						status: 'market_data_only',
						primaryWarnings: ['market-data-only connector coverage'],
						availableFollowups: ['compare_opportunities']
					}
				}
			]
		});

		assert.equal(catalogue.defaults.length, 1);
		assert.equal(catalogue.defaults[0]?.asset, 'USDC');
		assert.equal(catalogue.defaults[0]?.depositable, true);
		assert.equal(catalogue.defaults[0]?.mcpOpportunityId, 'kamino:lend:main-usdc');
		assert.equal(catalogue.earn[0]?.depositable, false);
		assert.equal(catalogue.counts.total, 2);
	});

	it('maps MCP allocation previews into Fabrick allocation decisions', () => {
		const allocation = mapMcpAllocationToDecision({
			allocation: {
				weights: [
					{
						opportunityId: 'kamino:lend:main-usdc',
						title: 'USDC Main Market',
						venue: 'Kamino',
						productType: 'lending_reserve',
						riskTier: 'conservative',
						weightPct: 70,
						apy: 0.041
					},
					{
						opportunityId: 'jupiter:earn:usdc',
						title: 'Jupiter USDC Earn',
						venue: 'Jupiter Lend',
						productType: 'vault',
						riskTier: 'moderate',
						weightPct: 30,
						apy: 0.034
					}
				],
				blendedApyPct: 3.89,
				blendedRiskScore: 22.8,
				riskEnvelope: 'Conservative USDC savings exposure',
				rebalanceStrategy: 'Review on catalogue refresh.',
				rationale: 'Deterministic allocation from Savings MCP.'
			}
		});

		assert.equal(allocation.weights.length, 2);
		assert.equal(allocation.weights[0]?.asset, 'USDC');
		assert.equal(allocation.weights[0]?.product, 'lend');
		assert.equal(allocation.weights[1]?.product, 'earn');
		assert.equal(allocation.blendedApyPct, 3.89);
		assert.match(allocation.rationale, /Savings MCP/);
	});
});
