#import "TalkToMePinStore.h"

#import <CommonCrypto/CommonDigest.h>
#import <Security/Security.h>

@implementation TalkToMePinStore {
  NSMutableDictionary<NSString *, NSString *> *_pins;
  NSLock *_lock;
}

+ (void)load
{
  TalkToMeInstallExpoFetchTrust();
}

+ (instancetype)shared
{
  static TalkToMePinStore *store;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    store = [TalkToMePinStore new];
  });
  return store;
}

- (instancetype)init
{
  if (self = [super init]) {
    _pins = [NSMutableDictionary new];
    _lock = [NSLock new];
  }
  return self;
}

- (void)replacePins:(NSArray<NSDictionary *> *)pins
{
  [_lock lock];
  [_pins removeAllObjects];
  for (NSDictionary *item in pins) {
    NSString *host = [item[@"hostname"] lowercaseString];
    NSString *sha = [self normalize:item[@"sha256"]];
    if (host.length > 0 && sha.length == 64) {
      _pins[host] = sha;
    }
  }
  [_lock unlock];
}

- (BOOL)handleChallenge:(NSURLAuthenticationChallenge *)challenge
      completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *_Nullable))completionHandler
{
  if (![challenge.protectionSpace.authenticationMethod isEqualToString:NSURLAuthenticationMethodServerTrust] ||
      challenge.protectionSpace.serverTrust == nil) {
    return NO;
  }

  NSString *host = challenge.protectionSpace.host.lowercaseString;
  NSString *expected = nil;
  [_lock lock];
  expected = _pins[host];
  [_lock unlock];
  if (expected.length == 0) {
    return NO;
  }

  NSString *actual = [self sha256OfTrust:challenge.protectionSpace.serverTrust];
  if (actual.length == 64 && [actual isEqualToString:expected]) {
    completionHandler(NSURLSessionAuthChallengeUseCredential,
                      [NSURLCredential credentialForTrust:challenge.protectionSpace.serverTrust]);
    return YES;
  }

  completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil);
  return YES;
}

- (NSString *)normalize:(NSString *)value
{
  NSString *raw = value ?: @"";
  NSCharacterSet *keep = [NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"];
  NSMutableString *hex = [NSMutableString new];
  for (NSUInteger i = 0; i < raw.length; i++) {
    unichar c = [raw characterAtIndex:i];
    if ([keep characterIsMember:c]) {
      [hex appendFormat:@"%c", c];
    }
  }
  return hex.lowercaseString;
}

- (NSString *)sha256OfTrust:(SecTrustRef)trust
{
  SecCertificateRef certificate = NULL;
  if (@available(iOS 15.0, *)) {
    CFArrayRef chain = SecTrustCopyCertificateChain(trust);
    if (chain && CFArrayGetCount(chain) > 0) {
      certificate = (SecCertificateRef)CFArrayGetValueAtIndex(chain, 0);
      if (certificate) {
        CFRetain(certificate);
      }
    }
    if (chain) {
      CFRelease(chain);
    }
  }
  if (!certificate) {
    return @"";
  }

  NSData *der = (__bridge_transfer NSData *)SecCertificateCopyData(certificate);
  CFRelease(certificate);
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(der.bytes, (CC_LONG)der.length, digest);
  NSMutableString *hex = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
    [hex appendFormat:@"%02x", digest[i]];
  }
  return hex;
}

@end
