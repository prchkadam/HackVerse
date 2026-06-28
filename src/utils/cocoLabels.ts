/**
 * COCO_LABELS — 80 sequential labels used for post-processed TFLite models
 * that output class indices 0-79 directly.
 */
export const COCO_LABELS = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote',
  'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book',
  'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

/**
 * COCO_91 — 91-element lookup for raw SSD/EfficientDet models
 * that output 90 classes where index 0 = background.
 *
 * Maps SSD class index (0-90) → label string or '' for gaps/background.
 * COCO category IDs are NOT contiguous (IDs 12,26,29,30,45,66,68,69,71,83 are unused).
 * Index 0 is background. Indices 1-90 map to the official COCO category IDs 1-90.
 */
export const COCO_91: string[] = [
  '',           // 0: background
  'person',     // 1
  'bicycle',    // 2
  'car',        // 3
  'motorcycle', // 4
  'airplane',   // 5
  'bus',        // 6
  'train',      // 7
  'truck',      // 8
  'boat',       // 9
  'traffic light', // 10
  'fire hydrant',  // 11
  '',           // 12: (unused in COCO)
  'stop sign',  // 13
  'parking meter', // 14
  'bench',      // 15
  'bird',       // 16
  'cat',        // 17
  'dog',        // 18
  'horse',      // 19
  'sheep',      // 20
  'cow',        // 21
  'elephant',   // 22
  'bear',       // 23
  'zebra',      // 24
  'giraffe',    // 25
  '',           // 26: (unused in COCO)
  'backpack',   // 27
  'umbrella',   // 28
  '',           // 29: (unused in COCO)
  '',           // 30: (unused in COCO)
  'handbag',    // 31
  'tie',        // 32
  'suitcase',   // 33
  'frisbee',    // 34
  'skis',       // 35
  'snowboard',  // 36
  'sports ball', // 37
  'kite',       // 38
  'baseball bat', // 39
  'baseball glove', // 40
  'skateboard', // 41
  'surfboard',  // 42
  'tennis racket', // 43
  'bottle',     // 44
  '',           // 45: (unused in COCO)
  'wine glass', // 46
  'cup',        // 47
  'fork',       // 48
  'knife',      // 49
  'spoon',      // 50
  'bowl',       // 51
  'banana',     // 52
  'apple',      // 53
  'sandwich',   // 54
  'orange',     // 55
  'broccoli',   // 56
  'carrot',     // 57
  'hot dog',    // 58
  'pizza',      // 59
  'donut',      // 60
  'cake',       // 61
  'chair',      // 62
  'couch',      // 63
  'potted plant', // 64
  'bed',        // 65
  '',           // 66: (unused in COCO)
  'dining table', // 67
  '',           // 68: (unused in COCO)
  '',           // 69: (unused in COCO)
  'toilet',     // 70
  '',           // 71: (unused in COCO)
  'tv',         // 72
  'laptop',     // 73
  'mouse',      // 74
  'remote',     // 75
  'keyboard',   // 76
  'cell phone', // 77
  'microwave',  // 78
  'oven',       // 79
  'toaster',    // 80
  'sink',       // 81
  'refrigerator', // 82
  '',           // 83: (unused in COCO)
  'book',       // 84
  'clock',      // 85
  'vase',       // 86
  'scissors',   // 87
  'teddy bear', // 88
  'hair drier', // 89
  'toothbrush', // 90
];
