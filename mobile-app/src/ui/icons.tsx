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

export function SpeakerIcon({ color = colors.text, muted = false, size = 20 }: IconProps & { muted?: boolean }) {
  const cone = size * 0.34;
  const bodyWidth = size * 0.22;
  const bodyHeight = size * 0.34;
  const wave1 = size * 0.42;
  const wave2 = size * 0.62;
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View
        style={[
          styles.speakerBody,
          {
            backgroundColor: color,
            width: bodyWidth,
            height: bodyHeight,
            left: size * 0.08,
            borderRadius: 2,
          },
        ]}
      />
      <View
        style={[
          styles.speakerCone,
          {
            left: size * 0.24,
            borderTopWidth: cone,
            borderBottomWidth: cone,
            borderLeftWidth: cone * 1.15,
            borderLeftColor: color,
          },
        ]}
      />
      {!muted ? (
        <>
          <View
            style={[
              styles.speakerWave,
              {
                width: wave1,
                height: wave1,
                borderColor: color,
                right: size * 0.22,
              },
            ]}
          />
          <View
            style={[
              styles.speakerWave,
              {
                width: wave2,
                height: wave2,
                borderColor: color,
                right: size * 0.04,
              },
            ]}
          />
        </>
      ) : (
        <>
          <View style={[styles.slashCut, { width: size * 0.92, backgroundColor: colors.mute }]} />
          <View style={[styles.slash, { width: size * 0.92, backgroundColor: color }]} />
        </>
      )}
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

export function PlayIcon({ color = colors.text, size = 14 }: IconProps) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: 2,
        borderTopWidth: size * 0.42,
        borderBottomWidth: size * 0.42,
        borderLeftWidth: size * 0.72,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
      {...iconEvents}
    />
  );
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

export function ListenOnlyIcon({ color = colors.muted, size = 14 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View style={[styles.micCapsule, { backgroundColor: color, width: size * 0.36, height: size * 0.5 }]} />
      <View style={[styles.micStand, { backgroundColor: color, height: size * 0.18 }]} />
      <View style={[styles.slash, { width: size * 0.92, backgroundColor: color, height: 1.5 }]} />
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

export function TrashIcon({ color = colors.danger, size = 20 }: IconProps) {
  const lid = size * 0.12;
  const can = size * 0.62;
  return (
    <View style={[styles.box, { width: size, height: size }]} {...iconEvents}>
      <View
        style={[
          styles.trashHandle,
          {
            borderColor: color,
            width: size * 0.28,
            height: size * 0.16,
            top: size * 0.04,
          },
        ]}
      />
      <View
        style={[
          styles.trashLid,
          {
            backgroundColor: color,
            width: size * 0.78,
            height: lid,
            top: size * 0.18,
          },
        ]}
      />
      <View
        style={[
          styles.trashCan,
          {
            borderColor: color,
            width: size * 0.62,
            height: can,
            top: size * 0.32,
          },
        ]}
      />
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
  },
  speakerCone: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  speakerWave: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 999,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '45deg' }],
  },
  slashCut: {
    position: 'absolute',
    height: 5,
    borderRadius: 2,
    transform: [{ rotate: '-38deg' }],
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
  trashHandle: {
    position: 'absolute',
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  trashLid: {
    position: 'absolute',
    borderRadius: 1,
  },
  trashCan: {
    position: 'absolute',
    borderWidth: 2,
    borderTopWidth: 0,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
});
