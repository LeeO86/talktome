import {
  createContext,
  useCallback,
  useContext,
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
  EDGE_SWIPE_START_WIDTH,
  EDGE_SWIPE_TOP_INSET,
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

const PageStackBackContext = createContext<(() => void) | null>(null);

/** Animated back for a page inside a `PageStack`; null outside one. */
export function usePageStackBack(): (() => void) | null {
  return useContext(PageStackBackContext);
}

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
  /** Paints pages whose own root view is transparent, so the one underneath does not show through. */
  backgroundColor?: string;
  children: ReactNode;
};

/**
 * UINavigationController-style page transitions: a deeper page slides in from the right over its
 * parent, going back slides it off again, and a drag from the left edge follows the finger.
 */
export function PageStack({
  ref,
  animated,
  swipeEnabled,
  onBack,
  underlay,
  pageKey,
  depth,
  backgroundColor,
  children,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const tracking = useRef(false);
  const generation = useRef(0);
  const shown = useRef({ pageKey, depth });
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const [underlayVisible, setUnderlayVisible] = useState(false);
  const [blockTouches, setBlockTouches] = useState(false);
  const latest = useRef({ animated, swipeEnabled, onBack, width });
  latest.current = { animated, swipeEnabled, onBack, width };

  const { edgeResponder, slideOut, settle } = useMemo(() => {
    const settle = () => {
      busy.current = false;
      tracking.current = false;
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
      if (!tracking.current) {
        return;
      }
      tracking.current = false;
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

    // Claims the touch on landing (before a scroll view can) and only moves the page once the
    // finger heads right, so a vertical drag or a tap on the strip does nothing.
    const edgeResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.swipeEnabled && !busy.current,
      onPanResponderMove: (_event, gesture) => {
        if (!tracking.current) {
          if (!shouldStartEdgeSwipe(gesture.dx, gesture.dy)) {
            return;
          }
          tracking.current = true;
          generation.current += 1;
          busy.current = true;
          setUnderlayVisible(true);
        }
        translateX.setValue(Math.max(0, gesture.dx));
      },
      onPanResponderTerminationRequest: () => !tracking.current,
      onPanResponderRelease: (_event, gesture) => release(gesture.dx, gesture.vx, true),
      onPanResponderTerminate: (_event, gesture) => release(gesture.dx, gesture.vx, false),
    });

    return { edgeResponder, slideOut, settle };
  }, [translateX]);

  const pop = useCallback(() => {
    // Mid-slide (say pairing finishes while the page is still sliding in), go back without animating.
    if (busy.current || !latest.current.animated) {
      latest.current.onBack();
      return;
    }
    slideOut(PAGE_TRANSITION_MS, PAGE_EASING);
  }, [slideOut]);

  useImperativeHandle(ref, () => ({ pop }), [pop]);

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
  const paint = backgroundColor ? { backgroundColor } : null;

  return (
    <PageStackBackContext.Provider value={pop}>
      <View
        style={styles.container}
        pointerEvents={blockTouches ? 'none' : 'auto'}
        onLayout={(event) => {
          const measured = event.nativeEvent.layout.width;
          if (measured > 0) {
            setWidth(measured);
          }
        }}
      >
        {underlayVisible ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, paint, { transform: [{ translateX: underlayX }] }]}
          >
            {underlay}
            <Animated.View style={[StyleSheet.absoluteFill, styles.dim, { opacity: dimOpacity }]} />
          </Animated.View>
        ) : null}
        <Animated.View
          style={[styles.page, paint, underlayVisible && styles.pageLifted, { transform: [{ translateX }] }]}
          onAccessibilityEscape={swipeEnabled ? pop : undefined}
        >
          {children}
        </Animated.View>
        {swipeEnabled ? <View style={styles.edge} {...edgeResponder.panHandlers} /> : null}
      </View>
    </PageStackBackContext.Provider>
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
  edge: {
    position: 'absolute',
    left: 0,
    top: EDGE_SWIPE_TOP_INSET,
    bottom: 0,
    width: EDGE_SWIPE_START_WIDTH,
  },
});
