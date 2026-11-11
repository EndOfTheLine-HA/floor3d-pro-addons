// SPDX-License-Identifier: MIT
import { install, ADOPT } from "./install.js";
import { CARD_TAG, VERSION, SUPPORTED_CARD_VERSION } from "./options.js";

// Finds cards already on the page, including inside shadow roots (HA renders
// dashboards several shadow roots deep). Runs once, right after installation.
function existingCards(root = globalThis.document) {
  const found = [];
  if (!root?.querySelectorAll) return found;
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    for (const element of node.querySelectorAll("*")) {
      if (element.localName === CARD_TAG) found.push(element);
      if (element.shadowRoot) queue.push(element.shadowRoot);
    }
  }
  return found;
}

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
      const CardClass = customElements.get(CARD_TAG);
      Object.assign(status, install(CardClass));
      const adopt = CardClass?.prototype?.[ADOPT];
      if (status.status === "installed" && typeof adopt === "function")
        for (const card of existingCards()) adopt.call(null, card);
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
