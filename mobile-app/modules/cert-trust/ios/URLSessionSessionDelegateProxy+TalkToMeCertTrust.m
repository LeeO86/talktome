#import <Foundation/Foundation.h>
#import <objc/runtime.h>

#import "TalkToMePinStore.h"

static void (*TalkToMeOriginalChallengeIMP)(
    id, SEL, NSURLSession *, NSURLSessionTask *, NSURLAuthenticationChallenge *, void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *));

static void TalkToMeSwizzledChallenge(
    id self,
    SEL _cmd,
    NSURLSession *session,
    NSURLSessionTask *task,
    NSURLAuthenticationChallenge *challenge,
    void (^completionHandler)(NSURLSessionAuthChallengeDisposition, NSURLCredential *))
{
  if ([[TalkToMePinStore shared] handleChallenge:challenge completionHandler:completionHandler]) {
    return;
  }
  if (TalkToMeOriginalChallengeIMP) {
    TalkToMeOriginalChallengeIMP(self, _cmd, session, task, challenge, completionHandler);
    return;
  }
  completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
}

void TalkToMeInstallExpoFetchTrust(void)
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    Class cls = NSClassFromString(@"URLSessionSessionDelegateProxy");
    if (!cls) {
      cls = NSClassFromString(@"ExpoModulesCore.URLSessionSessionDelegateProxy");
    }
    if (!cls) {
      cls = NSClassFromString(@"_TtC16ExpoModulesCore31URLSessionSessionDelegateProxy");
    }
    if (!cls) {
      return;
    }
    SEL selector = @selector(URLSession:task:didReceiveChallenge:completionHandler:);
    Method method = class_getInstanceMethod(cls, selector);
    if (!method) {
      return;
    }
    TalkToMeOriginalChallengeIMP =
        (void (*)(id, SEL, NSURLSession *, NSURLSessionTask *, NSURLAuthenticationChallenge *, void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *)))
            method_getImplementation(method);
    method_setImplementation(method, (IMP)TalkToMeSwizzledChallenge);
  });
}
