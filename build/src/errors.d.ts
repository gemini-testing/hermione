import { CoreError } from "./browser/core-error";
import { CancelledError } from "./browser-pool/cancelled-error";
import { ClientBridgeError } from "./browser/client-bridge/error";
import { HeightViewportError } from "./browser/screen-shooter/viewport/coord-validator/errors/height-viewport-error";
import { OffsetViewportError } from "./browser/screen-shooter/viewport/coord-validator/errors/offset-viewport-error";
import { AssertViewError } from "./browser/commands/assert-view/errors/assert-view-error";
import { ImageDiffError } from "./browser/commands/assert-view/errors/image-diff-error";
import { NoRefImageError } from "./browser/commands/assert-view/errors/no-ref-image-error";
declare const Errors: {
    readonly CoreError: typeof CoreError;
    readonly CancelledError: typeof CancelledError;
    readonly ClientBridgeError: typeof ClientBridgeError;
    readonly HeightViewportError: typeof HeightViewportError;
    readonly OffsetViewportError: typeof OffsetViewportError;
    readonly AssertViewError: typeof AssertViewError;
    readonly ImageDiffError: typeof ImageDiffError;
    readonly NoRefImageError: typeof NoRefImageError;
};
export default Errors;