#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

#ifdef __cplusplus
extern "C" {
#endif
void TalkToMeInstallExpoFetchTrust(void);
#ifdef __cplusplus
}
#endif

@interface TalkToMePinStore : NSObject

+ (instancetype)shared;
- (void)replacePins:(NSArray<NSDictionary *> *)pins;
- (BOOL)handleChallenge:(NSURLAuthenticationChallenge *)challenge
      completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition disposition, NSURLCredential *_Nullable credential))completionHandler;

@end

NS_ASSUME_NONNULL_END
