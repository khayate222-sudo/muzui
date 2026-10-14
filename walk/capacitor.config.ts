import { KeyboardResize } from '@capacitor/keyboard';
import type { CapacitorConfig } from '@capacitor/cli';
const config:CapacitorConfig={
 appId:'com.khayate222.walk',appName:'WALK',webDir:'dist',
 server:{androidScheme:'https'},
 plugins:{CapacitorHttp:{enabled:true},Keyboard:{resize:KeyboardResize.Native},StatusBar:{style:'LIGHT',backgroundColor:'#24374c',overlaysWebView:false}},
 ios:{contentInset:'automatic'},android:{backgroundColor:'#24374c'},
};
export default config;
