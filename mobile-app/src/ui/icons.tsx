import { StyleSheet, View } from 'react-native';

import { colors } from './theme';

type IconProps = {
  color?: string;
  size?: number;
};

const iconEvents = { pointerEvents: 'none' as const };

export function ConferenceIcon({ color = colors.accent, size = 22 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.ring, { width: size, height: size, borderColor: color }]} />
      <View style={[styles.ring, { width: size * 0.62, height: size * 0.62, borderColor: color }]} />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

export function HeadphonesIcon({ color = colors.accent, size = 22 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.headband, { borderColor: color, width: size * 0.72, height: size * 0.5 }]} />
      <View style={[styles.cup, { backgroundColor: color, left: 1 }]} />
      <View style={[styles.cup, { backgroundColor: color, right: 1 }]} />
    </View>
  );
}

export function PersonIcon({ color = colors.muted, size = 22 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.head, { backgroundColor: color }]} />
      <View style={[styles.shoulders, { backgroundColor: color }]} />
    </View>
  );
}

export function SpeakerIcon({ color = colors.text, muted = false, size = 18 }: IconProps & { muted?: boolean }) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.speakerBody, { backgroundColor: color, left: size * 0.12, height: size * 0.42 }]} />
      <View
        style={[
          styles.speakerCone,
          {
            left: size * 0.34,
            borderTopWidth: size * 0.28,
            borderBottomWidth: size * 0.28,
            borderLeftWidth: size * 0.36,
            borderLeftColor: color,
          },
        ]}
      />
      {muted ? <View style={[styles.slash, { backgroundColor: color, width: size * 0.86 }]} /> : null}
    </View>
  );
}

export function MicIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.micCapsule, { backgroundColor: color }]} />
      <View style={[styles.micStand, { backgroundColor: color }]} />
    </View>
  );
}

export function StopIcon({ color = colors.text, size = 14 }: IconProps) {
  return <View style={{ width: size, height: size, borderRadius: 3, backgroundColor: color }} {...iconEvents} />;
}

export function GearIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.gearTooth, { backgroundColor: color, width: size * 0.28, height: size }]} />
      <View
        style={[
          styles.gearTooth,
          { backgroundColor: color, width: size * 0.28, height: size, transform: [{ rotate: '60deg' }] },
        ]}
      />
      <View
        style={[
          styles.gearTooth,
          { backgroundColor: color, width: size * 0.28, height: size, transform: [{ rotate: '120deg' }] },
        ]}
      />
      <View style={[styles.gearHub, { width: size * 0.62, height: size * 0.62, backgroundColor: color }]} />
      <View style={[styles.gearHole, { width: size * 0.28, height: size * 0.28 }]} />
    </View>
  );
}

export function LockIcon({ color = colors.text, size = 16 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.lockShackle, { borderColor: color, width: size * 0.55, height: size * 0.4 }]} />
      <View style={[styles.lockBody, { backgroundColor: color, width: size * 0.72, height: size * 0.48 }]} />
    </View>
  );
}

export function ReplyArrowIcon({ color = colors.text, size = 18 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.replyStem, { backgroundColor: color }]} />
      <View style={[styles.replyHead, { borderRightColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 999,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  headband: {
    position: 'absolute',
    top: 2,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  cup: {
    position: 'absolute',
    width: 5,
    height: 10,
    borderRadius: 2,
    bottom: 3,
  },
  head: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  shoulders: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  speakerBody: {
    position: 'absolute',
    width: 5,
    borderRadius: 1,
  },
  speakerCone: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  slash: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '-38deg' }],
  },
  micCapsule: {
    width: 8,
    height: 11,
    borderRadius: 4,
  },
  micStand: {
    width: 2,
    height: 5,
    marginTop: 1,
  },
  gearTooth: {
    position: 'absolute',
    borderRadius: 2,
  },
  gearHub: {
    position: 'absolute',
    borderRadius: 999,
  },
  gearHole: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#142033',
  },
  replyStem: {
    width: 12,
    height: 2,
    marginLeft: 4,
  },
  lockShackle: {
    position: 'absolute',
    top: 0,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  lockBody: {
    position: 'absolute',
    bottom: 0,
    borderRadius: 2,
  },
  replyHead: {
    position: 'absolute',
    left: 0,
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
