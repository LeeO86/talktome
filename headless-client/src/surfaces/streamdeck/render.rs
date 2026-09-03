//! Renders key appearances and LCD strips to RGB images.

use std::path::Path;

use ab_glyph::{point, Font, FontVec, PxScale, ScaleFont};
use anyhow::{Context, Result};
use image::{Rgb as ImgRgb, RgbImage};

use super::layout::{palette, Appearance, Badge, Rgb};

pub struct Renderer {
    font: Option<FontVec>,
}

impl Renderer {
    pub fn load(font_path: &Path) -> Self {
        let font = match std::fs::read(font_path) {
            Ok(bytes) => match FontVec::try_from_vec(bytes) {
                Ok(font) => Some(font),
                Err(error) => {
                    tracing::warn!(event = "streamdeck-font-invalid", path = %font_path.display(), error = %error);
                    None
                }
            },
            Err(error) => {
                tracing::warn!(event = "streamdeck-font-missing", path = %font_path.display(), error = %error, "keys will be rendered without text");
                None
            }
        };
        Self { font }
    }

    pub fn from_bytes(bytes: Vec<u8>) -> Result<Self> {
        Ok(Self {
            font: Some(FontVec::try_from_vec(bytes).context("invalid font")?),
        })
    }

    pub fn has_font(&self) -> bool {
        self.font.is_some()
    }

    /// Renders one key of `size` pixels; `blink_phase` selects the blink colour.
    pub fn key(&self, appearance: &Appearance, size: (u32, u32), blink_phase: bool) -> RgbImage {
        let (w, h) = size;
        let background = match (appearance.blink, blink_phase) {
            (Some(alt), true) => alt,
            _ => appearance.background,
        };
        let mut image = RgbImage::from_pixel(w, h, to_pixel(background));

        let margin = (w as f32 * 0.07) as u32;
        let mut text_bottom = h - margin;
        if let Some(bar) = appearance.bar {
            let bar_h = (h as f32 * 0.09).max(3.0) as u32;
            let y0 = h - margin - bar_h;
            fill_rect(&mut image, margin, y0, w - 2 * margin, bar_h, Rgb(20, 20, 24));
            let filled = ((w - 2 * margin) as f32 * bar.clamp(0.0, 1.0)) as u32;
            fill_rect(&mut image, margin, y0, filled, bar_h, palette::BAR);
            text_bottom = y0 - margin / 2;
        }

        if let Some(badge) = appearance.badge {
            self.badge(&mut image, badge, margin);
        }

        if let Some(font) = &self.font {
            let title_scale = (h as f32 * 0.24).max(9.0);
            let subtitle_scale = (h as f32 * 0.17).max(8.0);
            let has_subtitle = !appearance.subtitle.trim().is_empty();
            let lines = wrap_title(font, &appearance.title, title_scale, (w - 2 * margin) as f32);
            let total = lines.len() as f32 * title_scale * 1.1 + if has_subtitle { subtitle_scale * 1.2 } else { 0.0 };
            let mut y = ((text_bottom as f32 - margin as f32 - total) / 2.0).max(margin as f32) + margin as f32 * 0.5;
            for line in lines {
                let scale = fit_scale(font, &line, title_scale, (w - 2 * margin) as f32);
                draw_text(&mut image, font, &line, scale, y, appearance.foreground);
                y += scale * 1.1;
            }
            if has_subtitle {
                let scale = fit_scale(font, &appearance.subtitle, subtitle_scale, (w - 2 * margin) as f32);
                draw_text(&mut image, font, &appearance.subtitle, scale, y + 2.0, appearance.foreground);
            }
        }
        image
    }

    fn badge(&self, image: &mut RgbImage, badge: Badge, margin: u32) {
        let (w, _) = image.dimensions();
        let size = (w as f32 * 0.16).max(6.0) as u32;
        let x = w - margin - size;
        let y = margin;
        match badge {
            Badge::Lock => {
                fill_rect(image, x, y + size / 3, size, size * 2 / 3, Rgb(250, 200, 60));
                fill_rect(image, x + size / 4, y, size / 2, size / 3, Rgb(250, 200, 60));
                fill_rect(image, x + size / 4 + 2, y + 2, (size / 2).saturating_sub(4), size / 3, palette::LOCKED);
            }
            Badge::Muted => {
                fill_rect(image, x, y, size, size, Rgb(230, 60, 60));
                for i in 0..size {
                    if let Some(px) = image.get_pixel_mut_checked(x + i, y + i) {
                        *px = to_pixel(palette::WHITE);
                    }
                    if let Some(px) = image.get_pixel_mut_checked(x + size - 1 - i, y + i) {
                        *px = to_pixel(palette::WHITE);
                    }
                }
            }
            Badge::OnAir => fill_rect(image, x, y, size, size, palette::WHITE),
            Badge::Incoming => fill_rect(image, x, y, size, size, Rgb(255, 235, 150)),
        }
    }

    /// Renders the Stream Deck + touch strip: one segment per encoder.
    pub fn strip(&self, size: (u32, u32), segments: &[StripSegment]) -> RgbImage {
        let (w, h) = size;
        let mut image = RgbImage::from_pixel(w, h, to_pixel(palette::OFFLINE));
        if segments.is_empty() {
            return image;
        }
        let horizontal = w >= h;
        let count = segments.len() as u32;
        let (seg_w, seg_h) = if horizontal { (w / count, h) } else { (w, h / count) };
        for (index, segment) in segments.iter().enumerate() {
            let (x0, y0) = if horizontal {
                (index as u32 * seg_w, 0)
            } else {
                (0, index as u32 * seg_h)
            };
            let margin = (seg_h.min(seg_w) as f32 * 0.1) as u32;
            fill_rect(&mut image, x0 + 1, y0 + 1, seg_w.saturating_sub(2), seg_h.saturating_sub(2), segment.background);
            let bar_h = (seg_h as f32 * 0.14).max(4.0) as u32;
            let bar_y = y0 + seg_h - margin - bar_h;
            fill_rect(&mut image, x0 + margin, bar_y, seg_w - 2 * margin, bar_h, Rgb(20, 20, 24));
            let filled = ((seg_w - 2 * margin) as f32 * segment.volume.clamp(0.0, 1.0)) as u32;
            fill_rect(&mut image, x0 + margin, bar_y, filled, bar_h, if segment.muted { palette::MUTED } else { palette::BAR });
            if let Some(font) = &self.font {
                let scale = (seg_h as f32 * 0.3).max(10.0);
                let scale = fit_scale(font, &segment.title, scale, (seg_w - 2 * margin) as f32);
                draw_text_at(&mut image, font, &segment.title, scale, x0 as f32, seg_w as f32, y0 as f32 + margin as f32, palette::IDLE_TEXT);
                let subtitle = if segment.muted {
                    "MUTED".to_string()
                } else {
                    format!("{}%", (segment.volume * 100.0).round() as u32)
                };
                let sub_scale = (seg_h as f32 * 0.22).max(9.0);
                draw_text_at(&mut image, font, &subtitle, sub_scale, x0 as f32, seg_w as f32, y0 as f32 + margin as f32 + scale * 1.1, palette::IDLE_TEXT);
            }
        }
        image
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct StripSegment {
    pub title: String,
    pub volume: f32,
    pub muted: bool,
    pub background: Rgb,
}

fn to_pixel(rgb: Rgb) -> ImgRgb<u8> {
    ImgRgb([rgb.0, rgb.1, rgb.2])
}

fn fill_rect(image: &mut RgbImage, x: u32, y: u32, w: u32, h: u32, color: Rgb) {
    let (iw, ih) = image.dimensions();
    for yy in y..(y + h).min(ih) {
        for xx in x..(x + w).min(iw) {
            image.put_pixel(xx, yy, to_pixel(color));
        }
    }
}

fn text_width(font: &FontVec, text: &str, scale: f32) -> f32 {
    let scaled = font.as_scaled(PxScale::from(scale));
    text.chars().map(|c| scaled.h_advance(scaled.glyph_id(c))).sum()
}

fn fit_scale(font: &FontVec, text: &str, scale: f32, max_width: f32) -> f32 {
    let width = text_width(font, text, scale);
    if width <= max_width || width <= 0.0 {
        scale
    } else {
        (scale * max_width / width).max(6.0)
    }
}

/// Splits a title into at most two lines at a space when it does not fit.
fn wrap_title(font: &FontVec, title: &str, scale: f32, max_width: f32) -> Vec<String> {
    let title = title.trim();
    if title.is_empty() {
        return Vec::new();
    }
    if text_width(font, title, scale) <= max_width {
        return vec![title.to_string()];
    }
    let words: Vec<&str> = title.split_whitespace().collect();
    if words.len() < 2 {
        return vec![title.to_string()];
    }
    let mut best: Option<(f32, String, String)> = None;
    for split in 1..words.len() {
        let first = words[..split].join(" ");
        let second = words[split..].join(" ");
        let widest = text_width(font, &first, scale).max(text_width(font, &second, scale));
        if best.as_ref().map(|(w, _, _)| widest < *w).unwrap_or(true) {
            best = Some((widest, first, second));
        }
    }
    match best {
        Some((_, first, second)) => vec![first, second],
        None => vec![title.to_string()],
    }
}

fn draw_text(image: &mut RgbImage, font: &FontVec, text: &str, scale: f32, top: f32, color: Rgb) {
    let (w, _) = image.dimensions();
    draw_text_at(image, font, text, scale, 0.0, w as f32, top, color);
}

fn draw_text_at(image: &mut RgbImage, font: &FontVec, text: &str, scale: f32, x0: f32, width: f32, top: f32, color: Rgb) {
    let scaled = font.as_scaled(PxScale::from(scale));
    let text_w = text_width(font, text, scale);
    let mut x = x0 + (width - text_w).max(0.0) / 2.0;
    let baseline = top + scaled.ascent();
    let (iw, ih) = image.dimensions();
    for ch in text.chars() {
        let id = scaled.glyph_id(ch);
        let glyph = id.with_scale_and_position(PxScale::from(scale), point(x, baseline));
        if let Some(outlined) = font.outline_glyph(glyph) {
            let bounds = outlined.px_bounds();
            outlined.draw(|gx, gy, coverage| {
                let px = bounds.min.x as i32 + gx as i32;
                let py = bounds.min.y as i32 + gy as i32;
                if px < 0 || py < 0 || px >= iw as i32 || py >= ih as i32 {
                    return;
                }
                let pixel = image.get_pixel_mut(px as u32, py as u32);
                let blend = |dst: u8, src: u8| (dst as f32 + (src as f32 - dst as f32) * coverage) as u8;
                *pixel = ImgRgb([blend(pixel[0], color.0), blend(pixel[1], color.1), blend(pixel[2], color.2)]);
            });
        }
        x += scaled.h_advance(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn renderer() -> Renderer {
        let path = Path::new("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf");
        Renderer::load(path)
    }

    #[test]
    fn renders_key_with_text_bar_and_badge() {
        let renderer = renderer();
        let mut appearance = Appearance::blank();
        appearance.title = "Camera Left".into();
        appearance.subtitle = "90%".into();
        appearance.background = palette::IDLE;
        appearance.bar = Some(0.5);
        appearance.badge = Some(Badge::Lock);
        let image = renderer.key(&appearance, (72, 72), false);
        assert_eq!(image.dimensions(), (72, 72));
        // Bar drawn: left half of the bar row is the bar colour.
        let bar_px = image.get_pixel(10, 63);
        assert_eq!(bar_px.0, [palette::BAR.0, palette::BAR.1, palette::BAR.2]);
        // Badge drawn in the top-right corner.
        let badge_px = image.get_pixel(66, 10);
        assert_ne!(badge_px.0, [palette::IDLE.0, palette::IDLE.1, palette::IDLE.2]);
        if renderer.has_font() {
            // Some text pixels differ from the background.
            let changed = image
                .pixels()
                .filter(|p| p.0 == [palette::IDLE_TEXT.0, palette::IDLE_TEXT.1, palette::IDLE_TEXT.2])
                .count();
            assert!(changed > 20, "text rendered: {changed}");
        }
    }

    #[test]
    fn blink_uses_alternate_colour() {
        let renderer = Renderer { font: None };
        let mut appearance = Appearance::blank();
        appearance.background = palette::INCOMING;
        appearance.blink = Some(palette::IDLE);
        let a = renderer.key(&appearance, (32, 32), false);
        let b = renderer.key(&appearance, (32, 32), true);
        assert_ne!(a.get_pixel(16, 16), b.get_pixel(16, 16));
    }

    #[test]
    fn renders_strip_segments() {
        let renderer = renderer();
        let segments = vec![
            StripSegment { title: "Crew".into(), volume: 0.9, muted: false, background: palette::VOLUME },
            StripSegment { title: "Cam 2".into(), volume: 0.3, muted: true, background: palette::VOLUME },
        ];
        let image = renderer.strip((800, 100), &segments);
        assert_eq!(image.dimensions(), (800, 100));
        let vertical = renderer.strip((100, 1200), &segments);
        assert_eq!(vertical.dimensions(), (100, 1200));
    }
}
