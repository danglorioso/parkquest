//
// @generated
// A blank Swift file must be created for native modules with Swift files to work correctly.
//
import Expo

// Subclasses ExpoReactNativeFactoryDelegate to inherit all required default implementations
// (createJSRuntimeFactory, newArchEnabled, fabricEnabled, etc.) while overriding bundleURL
// to point at the Metro server for development builds.
@objc(ParkQuestFactoryDelegate)
public class ParkQuestFactoryDelegate: ExpoReactNativeFactoryDelegate {
  @objc public override func bundleURL() -> URL? {
    #if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
    #else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
    #endif
  }
}
