//! Target identities shared by configuration, signalling and surfaces.

use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// A routable Talktome target. Feeds are listen-only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum TargetKey {
    User(i64),
    Conference(i64),
    Feed(i64),
}

impl TargetKey {
    /// Parses `user:4`, `conference:1`, `feed:2` (also `conf:1`).
    pub fn parse(text: &str) -> Option<Self> {
        let (kind, id) = text.trim().split_once(':')?;
        let id: i64 = id.trim().parse().ok()?;
        match kind.trim().to_ascii_lowercase().as_str() {
            "user" => Some(TargetKey::User(id)),
            "conference" | "conf" => Some(TargetKey::Conference(id)),
            "feed" => Some(TargetKey::Feed(id)),
            _ => None,
        }
    }

    pub fn from_type_and_id(kind: &str, id: &Value) -> Option<Self> {
        let id = match id {
            Value::Number(n) => n.as_i64()?,
            Value::String(s) => s.trim().parse().ok()?,
            _ => return None,
        };
        match kind.to_ascii_lowercase().as_str() {
            "user" => Some(TargetKey::User(id)),
            "conference" => Some(TargetKey::Conference(id)),
            "feed" => Some(TargetKey::Feed(id)),
            _ => None,
        }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            TargetKey::User(_) => "user",
            TargetKey::Conference(_) => "conference",
            TargetKey::Feed(_) => "feed",
        }
    }

    pub fn id(&self) -> i64 {
        match self {
            TargetKey::User(id) | TargetKey::Conference(id) | TargetKey::Feed(id) => *id,
        }
    }

    pub fn can_talk(&self) -> bool {
        !matches!(self, TargetKey::Feed(_))
    }

    /// The `{ type, id }` object used in `talk-targets-updated` / `ptt-state`.
    pub fn to_talk_target(&self) -> Value {
        json!({ "type": self.kind(), "id": self.id() })
    }
}

impl fmt::Display for TargetKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.kind(), self.id())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_formats_keys() {
        assert_eq!(TargetKey::parse("user:4"), Some(TargetKey::User(4)));
        assert_eq!(TargetKey::parse("conf:1"), Some(TargetKey::Conference(1)));
        assert_eq!(TargetKey::parse("Feed: 7"), Some(TargetKey::Feed(7)));
        assert_eq!(TargetKey::parse("bogus"), None);
        assert_eq!(TargetKey::Conference(3).to_string(), "conference:3");
        assert_eq!(
            TargetKey::from_type_and_id("user", &json!("12")),
            Some(TargetKey::User(12))
        );
        assert!(!TargetKey::Feed(1).can_talk());
    }
}
