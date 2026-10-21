export const DEFAULT_DEMO_STELLAR_ADDRESS =
  'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'

export const COMPLEXITY_TIERS = [
  { pts: 100, xlm: 100, label: 'Tier I · Standard', level: 'Low' },
  { pts: 150, xlm: 150, label: 'Tier II · Complex', level: 'Medium' },
  { pts: 200, xlm: 200, label: 'Tier III · Critical', level: 'High' },
]

export const INITIAL_DEMO_ISSUES = [
  {
    id: 101,
    repo_id: 1,
    github_issue_id: 1428,
    title:
      'HostError(Budget, ExceededLimit) during cross-contract Vec<Val> deep clone under Protocol 21',
    body: `## Summary

When invoking a cross-contract call via \`Env::invoke_contract\` that returns a nested \`Vec<Val>\` containing >128 \`BytesN<32>\` elements, the host traps with \`HostError(Budget, ExceededLimit)\` even though instruction metering shows <35% CPU budget consumption prior to return value marshaling.

## Environment
-Crate: \`soroban-env-host v21.2.0\`
- Network: Stellar Testnet (Protocol 21)

## Observed Trace
\`\`\`rust
HostError: Error(Budget, ExceededLimit)
  at soroban_env_host::budget::Budget::charge (budget.rs:412)
  at soroban_env_host::host::metered_clone::MeteredClone::metered_clone (metered_clone.rs:119)
\`\`\`

*(Note: Working on extracting a standalone contract Wasm fixture from our production DEX router workspace.)*`,
    author: 'kaspar-v',
    is_pr: false,
    state: 'open',
    created_at: '2026-10-21T09:14:00Z',
    diff: null,
    bounty_xlm: 150,
    complexity_pts: 150,
    readiness_score: 38,
    contributor_stellar_address:
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    bounty_status: 'escrowed',
    stellar_tx_hash: null,
    repository: {
      id: 1,
      owner: 'stellar',
      name: 'stellar-soroban-env',
    },
    triage_report: {
      id: 201,
      issue_id: 101,
      needs_repro: true,
      is_breaking: false,
      has_unit_tests: false,
      suggested_tags: ['needs-repro', 'budget-metering', 'protocol-21'],
      ai_summary:
        'Reports nonlinear memory/CPU charge amplification in `MeteredClone` when marshaling nested `Vec<Val>` across contract frames. Missing a minimal `.wasm` fixture or self-contained `Host` unit test to reproduce the exact `Budget::charge` curve.',
      drafted_reply: `Thanks for the detailed stack trace @kaspar-v.

To isolate whether \`MeteredClone\` is double-charging linear memory bytes on cross-contract return values, could you attach:
1. A minimal \`#[test]\` harness using \`Host::test_host_with_recording_footprint()\`
2. The exact \`CostType\` entry in \`Budget\` that trips \`ExceededLimit\` (via \`host.budget_cloned().print()\`)

Once a minimal repro is attached, we will unlock the **150 XLM** bounty tier for a patch.`,
      complexity: 'Medium',
      bounty_xlm: 150,
    },
  },
  {
    id: 102,
    repo_id: 1,
    github_issue_id: 1431,
    title:
      'feat(vm): enforce metered linear memory growth bounds in Vm::instantiate_from_wasm',
    body: `## Summary

Pre-charges initial Wasm linear memory pages before host module linking inside \`Vm::instantiate_from_wasm\` and tightens the exported signature to require an explicit \`ContractCostParams\` reference.

## Changes
- Validates \`memory.initial_pages <= MAX_VM_LINEAR_MEMORY_PAGES\` prior to \`wasmi::Linker\` instantiation.
- Prevents adversarial contracts from allocating un-metered host backing buffers during trap recovery.

\`\`\`diff
diff --git a/soroban-env-host/src/vm.rs b/soroban-env-host/src/vm.rs
--- a/soroban-env-host/src/vm.rs
+++ b/soroban-env-host/src/vm.rs
-pub fn instantiate_from_wasm(host: &Host, wasm_bytes: &[u8]) -> Result<Rc<Vm>, HostError> {
+pub fn instantiate_from_wasm(host: &Host, wasm_bytes: &[u8], cost_params: &ContractCostParams) -> Result<Rc<Vm>, HostError> {
+    host.charge_budget(ContractCostType::VmMemAlloc, Some(wasm_bytes.len() as u64))?;
     let engine = Vm::new_engine(host.budget_ref())?;
     Vm::from_parsed_module(host, engine, wasm_bytes)
 }
\`\`\``,
    author: 'graydon-s',
    is_pr: true,
    state: 'open',
    created_at: '2026-10-21T11:02:00Z',
    diff: `diff --git a/soroban-env-host/src/vm.rs b/soroban-env-host/src/vm.rs
--- a/soroban-env-host/src/vm.rs
+++ b/soroban-env-host/src/vm.rs
-pub fn instantiate_from_wasm(host: &Host, wasm_bytes: &[u8]) -> Result<Rc<Vm>, HostError> {
+pub fn instantiate_from_wasm(host: &Host, wasm_bytes: &[u8], cost_params: &ContractCostParams) -> Result<Rc<Vm>, HostError> {
+    host.charge_budget(ContractCostType::VmMemAlloc, Some(wasm_bytes.len() as u64))?;
     let engine = Vm::new_engine(host.budget_ref())?;
     Vm::from_parsed_module(host, engine, wasm_bytes)
 }`,
    bounty_xlm: 200,
    complexity_pts: 200,
    readiness_score: 62,
    contributor_stellar_address:
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    bounty_status: 'escrowed',
    stellar_tx_hash: null,
    repository: {
      id: 1,
      owner: 'stellar',
      name: 'stellar-soroban-env',
    },
    triage_report: {
      id: 202,
      issue_id: 102,
      needs_repro: false,
      is_breaking: true,
      has_unit_tests: false,
      suggested_tags: ['missing-tests', 'breaking-api', 'soroban-vm'],
      ai_summary:
        'Modifies public `Vm::instantiate_from_wasm` signature (breaking downstream embedders) and alters `VmMemAlloc` budget charging order without regression unit tests in `soroban-env-host/src/test/budget.rs`.',
      drafted_reply: `Thanks for the PR @graydon-s. Automated triage flagged two blockers before merge & bounty settlement:

1. **Missing Unit Tests (\`missing-tests\`)**: Please add a test in \`soroban-env-host/src/test/budget.rs\` asserting that oversized \`initial_pages\` traps with \`Error(Budget, ExceededLimit)\` before \`wasmi\` allocation.
2. **Public API Compatibility**: Keep \`Vm::instantiate_from_wasm(host, wasm_bytes)\` intact and introduce \`instantiate_from_wasm_with_cost_params\` to avoid breaking ledger replay harnesses.`,
      complexity: 'High',
      bounty_xlm: 200,
    },
  },
  {
    id: 103,
    repo_id: 1,
    github_issue_id: 1435,
    title:
      'fix(crypto): constant-time subgroup check in bls12_381_g1_msm host function',
    body: `## Summary

Ensures every G1 affine point passed into \`bls12_381_g1_msm\` undergoes constant-time subgroup membership verification prior to multi-scalar multiplication when strict cofactor clearing is enabled.

## Verification & Benchmarks
- Added 14 invalid-curve and non-prime-subgroup test vectors in \`soroban-env-host/src/test/bls12_381.rs\`.
- Verified calibration parity with \`CostType::Bls12381G1Msm\`.

\`\`\`diff
diff --git a/soroban-env-host/src/host/crypto/bls12_381.rs b/soroban-env-host/src/host/crypto/bls12_381.rs
--- a/soroban-env-host/src/host/crypto/bls12_381.rs
+++ b/soroban-env-host/src/host/crypto/bls12_381.rs
@@ -184,6 +184,9 @@ impl Host {
     pub(crate) fn bls12_381_g1_msm_internal(&self, vp: &[G1Affine], vs: &[Fr]) -> Result<G1Projective, HostError> {
+        for pt in vp.iter() {
+            self.check_point_is_in_g1_subgroup(pt)?;
+        }
         self.charge_budget(ContractCostType::Bls12381G1Msm, Some(vp.len() as u64))?;
         Ok(G1Projective::msm_unchecked(vp, vs))
     }
 }
diff --git a/soroban-env-host/src/test/bls12_381.rs b/soroban-env-host/src/test/bls12_381.rs
+++ b/soroban-env-host/src/test/bls12_381.rs
+#[test]
+fn test_bls12_381_g1_msm_rejects_non_subgroup_points() -> Result<(), HostError> {
+    let host = Host::default();
+    assert!(host.bls12_381_g1_msm_rejects_small_order_point().is_err());
+    Ok(())
+}
\`\`\``,
    author: 'sidharth-kr',
    is_pr: true,
    state: 'open',
    created_at: '2026-10-21T12:45:00Z',
    diff: `diff --git a/soroban-env-host/src/host/crypto/bls12_381.rs b/soroban-env-host/src/host/crypto/bls12_381.rs
+++ b/soroban-env-host/src/host/crypto/bls12_381.rs
diff --git a/soroban-env-host/src/test/bls12_381.rs b/soroban-env-host/src/test/bls12_381.rs
+++ b/soroban-env-host/src/test/bls12_381.rs
+fn test_bls12_381_g1_msm_rejects_non_subgroup_points()`,
    bounty_xlm: 150,
    complexity_pts: 150,
    readiness_score: 96,
    contributor_stellar_address:
      'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ',
    bounty_status: 'escrowed',
    stellar_tx_hash: null,
    repository: {
      id: 1,
      owner: 'stellar',
      name: 'stellar-soroban-env',
    },
    triage_report: {
      id: 203,
      issue_id: 103,
      needs_repro: false,
      is_breaking: false,
      has_unit_tests: true,
      suggested_tags: ['ready', 'crypto-bls12-381', 'security-verified'],
      ai_summary:
        'Clean, non-breaking cryptographic hardening patch for `bls12_381_g1_msm`. Includes negative subgroup test vectors in `test/bls12_381.rs` and preserves host interface stability. Ready for maintainer merge and 150 XLM Horizon settlement.',
      drafted_reply: `LGTM @sidharth-kr — subgroup verification placement prior to \`G1Projective::msm_unchecked\` is clean and the new negative test vectors in \`test/bls12_381.rs\` cover small-cofactor points.

Approving for merge and releasing the **150 XLM** bounty via Stellar Horizon Testnet.`,
      complexity: 'Medium',
      bounty_xlm: 150,
    },
  },
  {
    id: 104,
    repo_id: 2,
    github_issue_id: 11402,
    title:
      'Annotated Depends() cache key collision when sub-dependency uses callable class instance',
    body: `## Description

When two route parameters declare \`Annotated[ServiceClient, Depends(RateLimitedClient(rpm=60))]\` and \`Annotated[ServiceClient, Depends(RateLimitedClient(rpm=300))]\`, FastAPI's request-scoped dependency cache keys solely on \`call.__class__\` in certain async generator sub-trees and returns the \`rpm=60\` instance for both parameters.

## Expected Behavior
Each distinct callable instance with different \`__eq__\` / \`__hash__\` state should occupy a distinct key in \`solve_dependencies\` cache dictionary.`,
    author: 'SebasDev',
    is_pr: false,
    state: 'open',
    created_at: '2026-10-21T14:20:00Z',
    diff: null,
    bounty_xlm: 100,
    complexity_pts: 100,
    readiness_score: 44,
    contributor_stellar_address:
      'GD5DJQDDBKGAYNEAXU562HYGOOSYAEOO6AS53PZXBOZGCP5M2OPGMZV3',
    bounty_status: 'escrowed',
    stellar_tx_hash: null,
    repository: {
      id: 2,
      owner: 'fastapi',
      name: 'fastapi',
    },
    triage_report: {
      id: 204,
      issue_id: 104,
      needs_repro: true,
      is_breaking: false,
      has_unit_tests: false,
      suggested_tags: ['needs-repro', 'missing-tests', 'dependency-injection'],
      ai_summary:
        'Describes a plausible cache key collision in `fastapi.dependencies.utils.get_flat_dependant`, but lacks a runnable `TestClient` reproduction script showing how `__hash__` is implemented on `RateLimitedClient`.',
      drafted_reply: `Hi @SebasDev, thanks for the report.

FastAPI keys dependency cache entries by \`(dependant.call, tuple(sorted(security_scopes)))\`. Could you share a self-contained 20-line snippet showing the definition of \`RateLimitedClient\` (specifically whether \`__hash__\` and \`__eq__\` are defined or if it's a \`@dataclass\`)?`,
      complexity: 'Low',
      bounty_xlm: 100,
    },
  },
  {
    id: 105,
    repo_id: 1,
    github_issue_id: 1419,
    title:
      'perf(storage): batch footprint TTL extension ledger writes for persistent contract entries',
    body: `## Summary

Coalesces consecutive \`extend_contract_data_ttl\` host ledger mutations within the same transaction footprint into a single sorted batch write pass at host finalization.

## Verification
- Reduces host storage finalization overhead by 31% on 64-entry DeFi liquidity pool invocations.
- Full test coverage added in \`soroban-env-host/src/test/storage_ttl_test.rs\`.

\`\`\`diff
diff --git a/soroban-env-host/src/storage.rs b/soroban-env-host/src/storage.rs
--- a/soroban-env-host/src/storage.rs
+++ b/soroban-env-host/src/storage.rs
@@ -310,7 +310,8 @@ impl Storage {
     pub fn extend_ttl(&mut self, key: &Rc<ScVal>, threshold: u32, extend_to: u32) -> Result<(), HostError> {
-        self.flush_ttl_delta_immediate(key, extend_to)
+        self.pending_ttl_extensions.insert(key.clone(), TtlExtension { threshold, extend_to });
+        Ok(())
     }
 }
diff --git a/soroban-env-host/src/test/storage_ttl_test.rs b/soroban-env-host/src/test/storage_ttl_test.rs
+++ b/soroban-env-host/src/test/storage_ttl_test.rs
+#[test]
+fn test_batched_ttl_extension_coalesces_duplicate_keys() {
+    assert_eq!(run_ttl_batch_bench(), Ok(()));
+}
\`\`\``,
    author: 'tomer-stellar',
    is_pr: true,
    state: 'open',
    created_at: '2026-10-20T18:30:00Z',
    diff: `diff --git a/soroban-env-host/src/storage.rs b/soroban-env-host/src/storage.rs
+++ b/soroban-env-host/src/storage.rs
diff --git a/soroban-env-host/src/test/storage_ttl_test.rs b/soroban-env-host/src/test/storage_ttl_test.rs
+++ b/soroban-env-host/src/test/storage_ttl_test.rs`,
    bounty_xlm: 200,
    complexity_pts: 200,
    readiness_score: 98,
    contributor_stellar_address:
      'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    bounty_status: 'paid',
    stellar_tx_hash:
      '8f4e2b9c71d04a6e3b58c19f20a4d7e6b3c8a1f09e2d4b7c6a5f8e1d2c3b4a59',
    repository: {
      id: 1,
      owner: 'stellar',
      name: 'stellar-soroban-env',
    },
    triage_report: {
      id: 205,
      issue_id: 105,
      needs_repro: false,
      is_breaking: false,
      has_unit_tests: true,
      suggested_tags: ['ready', 'storage-footprint', 'perf'],
      ai_summary:
        'High-impact storage footprint optimization with deterministic BTreeMap batch ordering and comprehensive regression tests in `storage_ttl_test.rs`. Verified and settled on Stellar Testnet.',
      drafted_reply: `Verified and merged @tomer-stellar!

The \`BTreeMap\` key ordering guarantees deterministic footprint emission across validators. The **200 XLM** bounty has been settled on Stellar Testnet Horizon.`,
      complexity: 'High',
      bounty_xlm: 200,
    },
  },
]
