import { registerGlobals } from 'react-native-webrtc';

registerGlobals();

import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
