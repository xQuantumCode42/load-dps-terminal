export interface StatusState {
  settingUp: boolean;
  defaultActive: boolean;
  autoDefault: boolean;
  refreshEnabled: boolean;
  activeTerminal: boolean;
  session?: { shell: string; confirmed: boolean; failed?: boolean };
}
export function statusLabel(state: StatusState): string {
  if (state.settingUp) return 'LD: setting up';
  if (!state.refreshEnabled) return 'LD: refresh off';
  if (state.session) {
    if (state.session.confirmed) return `LD: ${state.session.shell}`;
    if (state.session.failed) return `LD: ${state.session.shell} error`;
    return `LD: ${state.session.shell} loading`;
  }
  if (!state.defaultActive) return state.autoDefault ? 'LD: not enabled' : 'LD: off';
  return state.activeTerminal ? 'LD: unhooked' : 'LD: + ready';
}
