import { describe, expect, it } from 'vitest';
import { classifyItem } from './classify';

const cases: [string, string, string][] = [
  ['Exam 1', 'CHM-113', 'exam'],
  ['Practice Final Exam', 'CHM-113', 'quiz'],
  ['Practice Quiz 1', 'CHM-113', 'quiz'],
  ['Quiz #1', 'CHM-113', 'quiz'],
  ['APA Quiz 1', 'ENG-105', 'quiz'],
  ['Microsoft Office 365 Quiz', 'UNV-106', 'quiz'],
  ['Topic 1 DQ 1', 'UNV-106', 'discussion'],
  ['Week 3 Participation', 'CHM-113', 'participation'],
  ['Topic 2 Participation', 'ENG-105', 'participation'],
  ['Stoichiometry Lab', 'CHM-113L', 'lab'],
  ['Chemical Safety and Equipment', 'CHM-113L', 'lab'],
  ['Benchmark - Lab Practical Exam', 'CHM-113L', 'lab'],
  ['CLC – Sensor Lab 1', 'ESG-162L', 'project'],
  ['CLC – Engineering Design Report and Demo 1', 'ESG-162L', 'project'],
  ['Chemistry Connections Essay', 'CHM-113L', 'paper'],
  ['Chemistry Connections Presentation', 'CHM-113L', 'paper'],
  ['Formal Lab Report', 'CHM-113L', 'paper'],
  ['First Draft of an Op-Ed Assignment (On-Ground)', 'ENG-105', 'paper'],
  ['Review Assignment: Peer or Self Review (On-Ground)', 'ENG-105', 'paper'],
  ['Review of AI Generated Text (On-Ground)', 'ENG-105', 'paper'],
  ['Final Video Reflection', 'UNV-106', 'paper'],
  ['Course Reflection', 'ESG-162L', 'paper'],
  ['AI-Assisted Career Reflection', 'UNV-106', 'paper'],
  ['Academic Plan Reflection', 'ESG-162', 'paper'],
  ['Topic 1 Homework', 'CHM-113', 'homework'],
  ['Topic 1 Activity', 'CHM-113', 'homework'],
  ['Topic 1 Review', 'ESG-162', 'homework'],
  ['MATLAB: Trigonometry', 'ESG-162', 'homework'],
  ['Excel: Microchip Manufacturing', 'ESG-162', 'homework'],
  ['Technology & Online Time Tracking (Excel Assignment)', 'UNV-106', 'homework'],
  ['Online Privacy & Security (PowerPoint Assignment)', 'UNV-106', 'paper'],
  ['Academic Plan', 'ESG-162', 'homework'],
  ['CHM113 Prerequisite Concept Assignment', 'CHM-113', 'homework'],
  ['UNV-106 Purpose Plan: Academic, Spiritual, and Career', 'UNV-106', 'other'],
  ['Effective Scheduling', 'ESG-162L', 'other'],
  ['Software Installation', 'ESG-162', 'other'],
];

describe('classifyItem', () => {
  it.each(cases)('%s (%s) -> %s', (title, course, expected) => {
    expect(classifyItem(title, course)).toBe(expected);
  });
});
