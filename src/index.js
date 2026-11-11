// SPDX-License-Identifier: MIT
import { install } from "./install.js";
import { CARD_TAG, VERSION, SUPPORTED_CARD_VERSION } from "./options.js";

const status = {
  version: VERSION,
  supportedCardVersion: SUPPORTED_CARD_VERSION,
  status: "waiting_for_card",
};
// Contains package/compatibility status only, never household configuration or entities.
globalThis.floor3dProAddons = status;

if (typeof customElements !== "undefined") {
  const activate = () => {
    try {
      Object.assign(status, install(customElements.get(CARD_TAG)));
    } catch {
      status.status = "failed";
      console.warn(
        "[Floor3D Pro Add-ons] Installation failed. Remove this resource and reload to return to native behavior.",
      );
    }
  };
  if (customElements.get(CARD_TAG)) activate();
  else customElements.whenDefined(CARD_TAG).then(activate);
}
