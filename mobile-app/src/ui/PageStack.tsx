import {
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { Animated, Dimensions, Easing, PanResponder, StyleSheet, View, type EasingFunction } from 'react-native';

import {
  EDGE_SWIPE_UNDERLAY_SHIFT,
  PAGE_TRANSITION_MS,
  edgeSwipeFinishDuration,
  shouldCompleteEdgeSwipe,
  shouldStartEdgeSwipe,
} from './edgeSwipe';

const PAGE_EASING = Easing.bezier(0.2, 0.9, 0.3, 1);

export type PageStackHandle = {
  /** Slides the current page off to the right, then calls `onBack`. */
  pop: () => void;
};

type Props = {
  ref?: Ref<PageStackHandle>;
  /** Slide on push and pop. Off means pages swap instantly and `pop` calls `onBack` directly. */
  animated: boolean;
  /** Allow the interactive left-edge back swipe. */
  swipeEnabled: boolean;
  onBack: () => void;
  /** The parent page, drawn underneath while a page slides. */
  underlay: ReactNode;
  /** Changes with the page; a deeper page slides in, a shallower one replaces it in place. */
  pageKey: string;
  depth: number;
  children: ReactNode;
};

/**
 * UINavigationController-style page transitions: a deeper page slides in from the right over its
 * parent, going back slides it off again, and a drag from the left edge follows the finger.
 */
export function PageStack({ ref, animated, swipeEnabled, onBack, underlay, pageKey, depth, children }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const containerRef = useRef<View>(null);
  const pageLeft = useRef(0);
  const busy = useRef(false);
  const generation = useRef(0);
  const shown = useRef({ pageKey, depth });
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const [underlayVisible, setUnderlayVisible] = useState(false);
  const [blockTouches, setBlockTouches] = useState(false);
  const latest = useRef({ animated, swipeEnabled, onBack, width });
  latest.current = { animated, swipeEnabled, onBack, width };

  const { responder, slideOut, settle } = useMemo(() => {
    const settle = () => {
      busy.current = false;
      translateX.setValue(0);
      setUnderlayVisible(false);
      setBlockTouches(false);
    };

    const slideOut = (duration: number, easing: EasingFunction) => {
      const run = ++generation.current;
      busy.current = true;
      setUnderlayVisible(true);
      setBlockTouches(true);
      Animated.timing(translateX, {
        toValue: latest.current.width,
        duration,
        easing,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (run !== generation.current) {
          return;
        }
        if (finished) {
          latest.current.onBack();
          return;
        }
        settle();
      });
    };

    const release = (dx: number, vx: number, allowBack: boolean) => {
      const sheetWidth = latest.current.width;
      if (allowBack && shouldCompleteEdgeSwipe(dx, vx, sheetWidth)) {
        slideOut(edgeSwipeFinishDuration(dx, vx, sheetWidth), Easing.out(Easing.cubic));
        return;
      }
      const run = ++generation.current;
      Animated.spring(translateX, {
        toValue: 0,
        speed: 20,
        bounciness: 0,
        useNativeDriver: true,
      }).start(() => {
        if (run === generation.current) {
          settle();
        }
      });
    };

    const responder = PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        latest.current.swipeEnabled &&
        !busy.current &&
        shouldStartEdgeSwipe(gesture.x0 - pageLeft.current, gesture.dx, gesture.dy),
      onPanResponderGrant: () => {
        generation.current += 1;
        busy.current = true;
        setUnderlayVisible(true);
      },
      onPanResponderMove: (_event, gesture) => translateX.setValue(Math.max(0, gesture.dx)),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gesture) => release(gesture.dx, gesture.vx, true),
      onPanResponderTerminate: (_event, gesture) => release(gesture.dx, gesture.vx, false),
    });

    return { responder, slideOut, settle };
  }, [translateX]);

  const pop = () => {
    // Mid-slide (say pairing finishes while the page is still sliding in), go back without animating.
    if (busy.current || !latest.current.animated) {
      latest.current.onBack();
      return;
    }
    slideOut(PAGE_TRANSITION_MS, PAGE_EASING);
  };

  useImperativeHandle(ref, () => ({ pop }));

  useLayoutEffect(() => {
    const previous = shown.current;
    shown.current = { pageKey, depth };
    if (previous.pageKey === pageKey) {
      return;
    }
    translateX.stopAnimation();
    if (!latest.current.animated || depth <= previous.depth) {
      generation.current += 1;
      settle();
      return;
    }
    const run = ++generation.current;
    busy.current = true;
    translateX.setValue(latest.current.width);
    setUnderlayVisible(true);
    setBlockTouches(true);
    Animated.timing(translateX, {
      toValue: 0,
      duration: PAGE_TRANSITION_MS,
      easing: PAGE_EASING,
      useNativeDriver: true,
    }).start(() => {
      if (run === generation.current) {
        settle();
      }
    });
  }, [pageKey, depth, translateX, settle]);

  const measure = () => {
    containerRef.current?.measure((_x, _y, measuredWidth, _height, pageX) => {
      pageLeft.current = pageX;
      if (measuredWidth > 0) {
        setWidth(measuredWidth);
      }
    });
  };

  const underlayX = translateX.interpolate({
    inputRange: [0, width],
    outputRange: [-width * EDGE_SWIPE_UNDERLAY_SHIFT, 0],
    extrapolate: 'clamp',
  });
  const dimOpacity = translateX.interpolate({
    inputRange: [0, width],
    outputRange: [0.12, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      ref={containerRef}
      style={styles.container}
      pointerEvents={blockTouches ? 'none' : 'auto'}
      onLayout={measure}
    >
      {underlayVisible ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: underlayX }] }]}
        >
          {underlay}
          <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dimOpacity }]} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[styles.page, underlayVisible && styles.pageLifted, { transform: [{ translateX }] }]}
        onAccessibilityEscape={swipeEnabled ? pop : undefined}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  page: {
    flex: 1,
  },
  pageLifted: {
    shadowColor: '#000',
    shadowOffset: { width: -3, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  dim: {
    backgroundColor: '#000',
  },
});
