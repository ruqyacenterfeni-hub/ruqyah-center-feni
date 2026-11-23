const express = require('express');
const router = express.Router();
const db = require('../database/db');

// 1. Get All Courses
router.get('/', (req, res) => {
  try {
    const courses = db.prepare('SELECT * FROM courses WHERE is_active = 1 ORDER BY display_order ASC').all();
    
    // Attach lesson count to each course
    const enriched = courses.map(course => {
      const moduleCount = db.prepare('SELECT COUNT(*) as count FROM course_modules WHERE course_id = ?').get(course.id).count;
      const lessonCount = db.prepare(`
        SELECT COUNT(cl.id) as count 
        FROM course_lessons cl
        JOIN course_modules cm ON cl.module_id = cm.id
        WHERE cm.course_id = ?
      `).get(course.id).count;

      return {
        ...course,
        module_count: moduleCount,
        lesson_count: lessonCount
      };
    });

    res.json({ success: true, courses: enriched });
  } catch (err) {
    console.error('Fetch courses error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve courses' });
  }
});

// 2. Get Course Detail with Modules and Lessons by Slug
router.get('/:slug', (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM courses WHERE slug = ? AND is_active = 1').get(req.params.slug);
    if (!course) {
      return res.status(404).json({ success: false, error: 'Course not found' });
    }

    const modules = db.prepare('SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC').all(course.id);
    const modulesWithLessons = modules.map(mod => {
      const lessons = db.prepare('SELECT id, title_bn, title_en, duration, sort_order FROM course_lessons WHERE module_id = ? ORDER BY sort_order ASC').all(mod.id);
      return {
        ...mod,
        lessons
      };
    });

    res.json({
      success: true,
      course,
      curriculum: modulesWithLessons
    });
  } catch (err) {
    console.error('Fetch course detail error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve course details' });
  }
});

module.exports = router;
