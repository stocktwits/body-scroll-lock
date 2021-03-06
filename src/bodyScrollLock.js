// @flow
// Adopted and modified solution from Bohdan Didukh (2017)
// https://stackoverflow.com/questions/41594997/ios-10-safari-prevent-scrolling-behind-a-fixed-overlay-and-maintain-scroll-posi

export interface BodyScrollOptions {
  reserveScrollBarGap?: boolean;
}

// Older browsers don't support event options, feature detect it.
let hasPassiveEvents = false;
if (typeof window !== 'undefined') {
  const passiveTestOptions = {
    get passive() {
      hasPassiveEvents = true;
      return undefined;
    },
  };
  window.addEventListener('testPassive', null, passiveTestOptions);
  window.removeEventListener('testPassive', null, passiveTestOptions);
}

const isIosDevice =
  typeof window !== 'undefined' &&
  window.navigator &&
  window.navigator.platform &&
  /iPad|iPhone|iPod|(iPad Simulator)|(iPhone Simulator)|(iPod Simulator)/.test(window.navigator.platform);
type HandleScrollEvent = TouchEvent;

let firstTargetElement: HTMLElement | null = null;
let allTargetElements: Array<HTMLElement> = [];
let documentListenerAdded: boolean = false;
let initialClientY: number = -1;
let previousBodyOverflowSetting;
let previousBodyPaddingRight;

const preventDefault = (rawEvent: HandleScrollEvent): boolean => {
  const e = rawEvent || window.event;

  // Do not prevent if the event has more than one touch (usually meaning this is a multi touch gesture like pinch to zoom)
  if (e.touches.length > 1) return true;

  if (e.preventDefault) e.preventDefault();

  return false;
};

const setOverflowHidden = (options?: BodyScrollOptions) => {
  // Setting overflow on body/documentElement synchronously in Desktop Safari slows down
  // the responsiveness for some reason. Setting within a setTimeout fixes this.
  setTimeout(() => {
    // If previousBodyPaddingRight is already set, don't set it again.
    if (previousBodyPaddingRight === undefined) {
      const reserveScrollBarGap = !!options && options.reserveScrollBarGap === true;
      const scrollBarGap = window.innerWidth - document.documentElement.clientWidth;

      if (reserveScrollBarGap && scrollBarGap > 0) {
        previousBodyPaddingRight = document.body.style.paddingRight;
        document.body.style.paddingRight = `${scrollBarGap}px`;
      }
    }

    // If previousBodyOverflowSetting is already set, don't set it again.
    if (previousBodyOverflowSetting === undefined) {
      previousBodyOverflowSetting = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
  });
};

const restoreOverflowSetting = () => {
  // Setting overflow on body/documentElement synchronously in Desktop Safari slows down
  // the responsiveness for some reason. Setting within a setTimeout fixes this.
  setTimeout(() => {
    if (previousBodyPaddingRight !== undefined) {
      document.body.style.paddingRight = previousBodyPaddingRight;

      // Restore previousBodyPaddingRight to undefined so setOverflowHidden knows it
      // can be set again.
      previousBodyPaddingRight = undefined;
    }

    if (previousBodyOverflowSetting !== undefined) {
      document.body.style.overflow = previousBodyOverflowSetting;

      // Restore previousBodyOverflowSetting to undefined
      // so setOverflowHidden knows it can be set again.
      previousBodyOverflowSetting = undefined;
    }
  });
};

// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight#Problems_and_solutions
const isTargetElementTotallyScrolled = (targetElement: any): boolean =>
  targetElement ? targetElement.scrollHeight - targetElement.scrollTop <= targetElement.clientHeight : false;


function getScrollParent(node: any, root: any, diff: number) {
  if (!node || !root) {
    return null;
  }

  if (node === root) {
    return root;
  }

  if (
    node.clientHeight > 0 &&
    node.scrollHeight > node.clientHeight &&
    (node.scrollTop > 0 || diff < 0) &&
    (!isTargetElementTotallyScrolled(node) || diff > 0)
  ) {
    return node;
  } else {
    return getScrollParent(node.parentNode, root, diff);
  }
}

const handleScroll = (event: HandleScrollEvent, targetElement: any): boolean => {
  const clientY = event.targetTouches[0].clientY - initialClientY;

  const scrollableTarget = getScrollParent(event.target, targetElement, clientY);
  if (!scrollableTarget || clientY === 0) {
    event.stopPropagation();
    return true;
  }

  if (scrollableTarget.scrollTop === 0 && clientY > 0) {
    // element is at the top of its scroll
    return preventDefault(event);
  }

  if (isTargetElementTotallyScrolled(scrollableTarget) && clientY < 0) {
    // element is at the top of its scroll
    return preventDefault(event);
  }

  event.stopPropagation();
  return true;
};

export const disableBodyScroll = (targetElement: any, options?: BodyScrollOptions): void => {
  if (isIosDevice) {
    // targetElement must be provided, and disableBodyScroll must not have been
    // called on this targetElement before.
    if (targetElement && !allTargetElements.includes(targetElement)) {
      allTargetElements = [...allTargetElements, targetElement];

      targetElement.ontouchstart = (event: HandleScrollEvent) => {
        if (event.targetTouches.length === 1) {
          // detect single touch
          initialClientY = event.targetTouches[0].clientY;
        }
      };
      targetElement.ontouchmove = (event: HandleScrollEvent) => {
        if (event.targetTouches.length === 1) {
          // detect single touch
          handleScroll(event, targetElement);
        }
      };

      if (!documentListenerAdded) {
        document.addEventListener('touchmove', preventDefault, hasPassiveEvents ? { passive: false } : undefined);
        documentListenerAdded = true;
      }
    }
  } else {
    setOverflowHidden(options);

    if (!firstTargetElement) firstTargetElement = targetElement;
  }
};

export const clearAllBodyScrollLocks = (): void => {
  if (isIosDevice) {
    // Clear all allTargetElements ontouchstart/ontouchmove handlers, and the references
    allTargetElements.forEach((targetElement: any) => {
      targetElement.ontouchstart = null;
      targetElement.ontouchmove = null;
    });

    if (documentListenerAdded) {
      document.removeEventListener('touchmove', preventDefault, hasPassiveEvents ? { passive: false } : undefined);
      documentListenerAdded = false;
    }

    allTargetElements = [];

    // Reset initial clientY
    initialClientY = -1;
  } else {
    restoreOverflowSetting();

    firstTargetElement = null;
  }
};

export const enableBodyScroll = (targetElement: any): void => {
  if (isIosDevice) {
    targetElement.ontouchstart = null;
    targetElement.ontouchmove = null;

    allTargetElements = allTargetElements.filter(element => element !== targetElement);

    if (documentListenerAdded && allTargetElements.length === 0) {
      document.removeEventListener('touchmove', preventDefault, hasPassiveEvents ? { passive: false } : undefined);
      documentListenerAdded = false;
    }
  } else if (firstTargetElement === targetElement) {
    restoreOverflowSetting();

    firstTargetElement = null;
  }
};
