import { assert } from "chai";
import { config } from "../package.json";
import { getStyles } from "../src/modules/render/styles";

describe("save category animation overlay", function () {
  it("should keep the overlay positioned absolutely above header children", function () {
    const css = getStyles();
    const sidebarId = `${config.addonRef}-vertical-tabs-sidebar`;

    // The header-children rule gives every direct child position: relative and z-index: 2.
    // The save-success overlay is a direct child of the header, so it must have a
    // higher-specificity rule that restores position: absolute and z-index: 10.
    const overlayRule = new RegExp(
      `#${sidebarId}\\s+\\.vertical-tabs-category-header\\s+\\.vt-save-success-overlay\\s*\\{[^}]*position:\\s*absolute;[^}]*z-index:\\s*10;[^}]*\\}`,
    );

    assert.match(
      css,
      overlayRule,
      ".vt-save-success-overlay must override header > * with position:absolute and z-index:10",
    );

    // The header itself must establish a positioning context so that the overlay's
    // absolute inset is clipped to the header, not to the whole category wrapper.
    const headerRule = new RegExp(
      `#${sidebarId}\\s+\\.vertical-tabs-category-header\\s*\\{[^}]*position:\\s*relative;[^}]*\\}`,
    );

    assert.match(
      css,
      headerRule,
      ".vertical-tabs-category-header must be position:relative to contain the overlay",
    );
  });
});
