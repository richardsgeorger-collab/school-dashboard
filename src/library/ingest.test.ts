import { describe, expect, it } from 'vitest';
import { classifyFile, fileKey } from './ingest';

describe('what a dropped file is', () => {
  it('sorts audio, slides, and a syllabus by name and type', () => {
    expect(classifyFile('CHM-113 Sep 15.m4a')).toBe('audio');
    expect(classifyFile('lecture.mp3', 'audio/mpeg')).toBe('audio');
    expect(classifyFile('Topic3_Stoichiometry.pdf', 'application/pdf')).toBe('deck');
    expect(classifyFile('Week5.pptx')).toBe('deck');
    expect(classifyFile('CHM113 Syllabus Fall 2026.pdf', 'application/pdf')).toBe('syllabus');
    expect(classifyFile('syllabus.txt', 'text/plain')).toBe('syllabus');
    expect(classifyFile('notes.docx')).toBe('unknown');
  });
  it('remembers a class by a distinctive first word only', () => {
    expect(fileKey('CHM113_Topic3_Stoichiometry.pdf')).toBe('chm113');
    expect(fileKey('ESG-162 Week 5.pptx')).toBe('esg');
    expect(fileKey('Lecture 5.m4a')).toBeNull();
    expect(fileKey('12.pdf')).toBeNull();
    expect(fileKey('ab.pdf')).toBeNull();
    expect(fileKey('EngMath-Vectors.pdf')).toBe('engmath');
  });
});
