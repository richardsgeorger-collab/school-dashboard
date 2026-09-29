import { describe, expect, it } from 'vitest';
import type { StoredResource } from '../halo/announce';
import { studyFilesFor } from './haloFiles';

const r = (title: string, unit: string | null, files: string[], courseId = 'chm'): StoredResource => ({ id: title, title, description: null, instructorAdded: false, unit, files: files.map((name, i) => ({ id: `${title}${i}`, name, kind: null, type: null })), courseId, pulledAt: 'x' });

describe('Halo files worth dropping into Practice', () => {
  it('puts the test’s own unit first, keeps only documents, and never another class', () => {
    const list = [r('Syllabus', null, ['CHM113 Syllabus.pdf']), r('Topic 3 Slides', 'Topic 3', ['T3 Bonding.pptx']), r('Topic 4 Slides', 'Topic 4', ['T4 Shapes.pptx', 'lab.mp4']), r('Other', 'Topic 4', ['x.pdf'], 'eng')];
    expect(studyFilesFor(list, 'chm', 'Topic 4: Molecular Shapes')).toEqual(['T4 Shapes.pptx', 'T3 Bonding.pptx', 'CHM113 Syllabus.pdf']);
    expect(studyFilesFor([], 'chm')).toEqual([]);
  });
});
