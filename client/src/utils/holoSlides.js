// What the Holo view flips through: every picture of every gift in the museum room, in order.
// A gift with three pictures is three slides; gifts without pictures (writing) are skipped.
//   items: the museum viewer's artworks ([{ submission: { id, title, images, imageDescriptions } }])
// -> [{ key, itemIndex, imageIndex, pictureCount, image, alt, seed }]
export function holoSlides(items = []) {
  const slides = [];
  items.forEach((item, itemIndex) => {
    const sub = item?.submission;
    const images = (sub?.images || []).filter(Boolean);
    images.forEach((image, imageIndex) => {
      const title = sub.title || 'A gift';
      const described = sub.imageDescriptions?.[imageIndex];
      slides.push({
        key: `${sub.id}-${imageIndex}`,
        itemIndex,
        imageIndex,
        pictureCount: images.length,
        image,
        alt: described || (images.length > 1 ? `${title}, picture ${imageIndex + 1} of ${images.length}` : title),
        // Each picture gets its own sparkle pattern, the same every time
        seed: imageIndex ? `${sub.id}:${imageIndex}` : String(sub.id),
      });
    });
  });
  return slides;
}

// The first slide of the artwork at itemIndex (the start if it has none)
export function firstSlideOf(slides, itemIndex) {
  const i = slides.findIndex((s) => s.itemIndex === itemIndex);
  return i === -1 ? 0 : i;
}
