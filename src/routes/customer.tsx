/**
 * F-11 — Customer Workspace route (/customer).
 *
 * Composes the five customer panels against a single CustomerViewModel.
 * The view-model's type signature is the load-bearing negative-contract
 * guard (see src/components/customer/viewModel.ts): the model does not
 * carry ProductSignal, capability_gap rows, or any free-text not already
 * sanitised — so this route literally cannot leak them.
 *
 * v1 wiring: the route accepts an optional `initialViewModel` prop so
 * tests and the F-19 eval harness can seed canned state without firing
 * live agent calls. Future work wires the submit handler into the
 * F-04/F-05/F-07/F-10 pipeline; for v1 the screen renders whatever
 * view-model is handed in.
 */
import { useState } from 'react';
import {
  EMPTY_CUSTOMER_VIEW_MODEL,
  type CustomerViewModel,
} from '@components/customer/viewModel';
import { IntentInputPanel } from '@components/customer/IntentInputPanel';
import { CompiledConfigPanel } from '@components/customer/CompiledConfigPanel';
import { CapabilityStatusPanel } from '@components/customer/CapabilityStatusPanel';
import { ClarificationLoopPanel } from '@components/customer/ClarificationLoopPanel';
import { ReadinessPanel } from '@components/customer/ReadinessPanel';

interface CustomerRouteProps {
  /** Optional seed for tests + eval harness. Defaults to an empty model. */
  readonly initialViewModel?: CustomerViewModel;
  /** Optional handler called when the customer submits intent. */
  readonly onSubmitIntent?: (raw: string) => void;
}

export default function CustomerRoute({
  initialViewModel = EMPTY_CUSTOMER_VIEW_MODEL,
  onSubmitIntent,
}: CustomerRouteProps) {
  const [vm] = useState<CustomerViewModel>(initialViewModel);

  function handleSubmit(raw: string) {
    if (onSubmitIntent) onSubmitIntent(raw);
  }

  return (
    <div data-testid="customer-route" style={rootStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Customer Workspace</h1>
        <p style={subtitleStyle}>
          Paste your business intent. The system will compile a configuration,
          show which parts are covered, and ask clarifying questions as needed.
        </p>
      </header>
      <IntentInputPanel
        initialValue={vm.intent?.raw ?? ''}
        onSubmit={handleSubmit}
      />
      <CompiledConfigPanel configuration={vm.configuration} />
      <CapabilityStatusPanel assessments={vm.assessments} />
      <ClarificationLoopPanel clarifications={vm.clarifications} />
      <ReadinessPanel readiness={vm.readiness} />
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
};
const headerStyle: React.CSSProperties = {
  marginBottom: 16,
};
const titleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 500, margin: '0 0 8px', color: '#32363a',
};
const subtitleStyle: React.CSSProperties = {
  fontSize: 14, color: '#5a6168', margin: 0,
};
