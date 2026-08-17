#import <React/RCTHTTPRequestHandler.h>

#import "TalkToMePinStore.h"

@implementation RCTHTTPRequestHandler (TalkToMeCertTrust)

- (void)URLSession:(NSURLSession *)session
didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge
 completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition disposition, NSURLCredential *credential))completionHandler
{
  if ([[TalkToMePinStore shared] handleChallenge:challenge completionHandler:completionHandler]) {
    return;
  }
  completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
}

@end
