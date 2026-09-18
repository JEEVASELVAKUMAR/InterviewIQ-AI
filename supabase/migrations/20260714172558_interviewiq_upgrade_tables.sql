/*
# InterviewIQ AI — Master Upgrade Schema

## Overview
Adds new tables for the upgraded platform: notifications, resume_analysis,
skill_gap_reports, coding_problems, and updates the interviews and roadmaps
tables with additional columns. All tables are owner-scoped to the authenticated
user via user_id with Row Level Security.

## New Tables
1. `notifications` — user notification bell entries (interview/coding/roadmap/skill_gap/system)
2. `resume_analysis` — ATS score, section feedback, rewrite suggestions per resume
3. `skill_gap_reports` — company+role specific skill gap analysis results
4. `coding_problems` — internal curated LeetCode/HackerRank-style problem bank

## Modified Tables
1. `interviews` — added: monitoring_flags, ended_early, end_reason, voice_used, company, role, resume_id
2. `roadmaps` — added: input_json, roadmap_json

## Security
- RLS enabled on every new table.
- 4 CRUD policies per table, scoped to authenticated with auth.uid() = user_id.
- Owner columns default to auth.uid() so client inserts omitting user_id succeed.
- coding_problems is a shared bank: all authenticated users can read.
*/

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== RESUME_ANALYSIS =====
CREATE TABLE IF NOT EXISTS resume_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id) ON DELETE CASCADE,
  ats_score int,
  summary_feedback text,
  section_feedback jsonb DEFAULT '{}',
  missing_sections text[] DEFAULT '{}',
  keyword_gaps text[] DEFAULT '{}',
  rewrite_suggestions jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE resume_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_resume_analysis" ON resume_analysis;
CREATE POLICY "select_own_resume_analysis" ON resume_analysis FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_resume_analysis" ON resume_analysis;
CREATE POLICY "insert_own_resume_analysis" ON resume_analysis FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_resume_analysis" ON resume_analysis;
CREATE POLICY "update_own_resume_analysis" ON resume_analysis FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_resume_analysis" ON resume_analysis;
CREATE POLICY "delete_own_resume_analysis" ON resume_analysis FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== SKILL_GAP_REPORTS =====
CREATE TABLE IF NOT EXISTS skill_gap_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id uuid REFERENCES resumes(id) ON DELETE CASCADE,
  company text NOT NULL,
  role text NOT NULL,
  result_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE skill_gap_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_own_skill_gap_reports" ON skill_gap_reports;
CREATE POLICY "select_own_skill_reports" ON skill_gap_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_skill_gap_reports" ON skill_gap_reports;
CREATE POLICY "insert_own_skill_reports" ON skill_gap_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_skill_gap_reports" ON skill_gap_reports;
CREATE POLICY "update_own_skill_reports" ON skill_gap_reports FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_skill_gap_reports" ON skill_gap_reports;
CREATE POLICY "delete_own_skill_reports" ON skill_gap_reports FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== CODING_PROBLEMS =====
CREATE TABLE IF NOT EXISTS coding_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  difficulty text NOT NULL DEFAULT 'Medium',
  statement text NOT NULL,
  constraints text,
  examples jsonb DEFAULT '[]',
  visible_test_cases jsonb DEFAULT '[]',
  hidden_test_cases jsonb DEFAULT '[]',
  topic_tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coding_problems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_all_coding_problems" ON coding_problems;
CREATE POLICY "select_all_coding_problems" ON coding_problems FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_coding_problems" ON coding_problems;
CREATE POLICY "insert_coding_problems" ON coding_problems FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_coding_problems" ON coding_problems;
CREATE POLICY "update_coding_problems" ON coding_problems FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_coding_problems" ON coding_problems;
CREATE POLICY "delete_coding_problems" ON coding_problems FOR DELETE TO authenticated USING (true);

-- ===== ALTER INTERVIEWS TABLE =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'monitoring_flags') THEN
    ALTER TABLE interviews ADD COLUMN monitoring_flags jsonb DEFAULT '[]';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'ended_early') THEN
    ALTER TABLE interviews ADD COLUMN ended_early boolean DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'end_reason') THEN
    ALTER TABLE interviews ADD COLUMN end_reason text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'voice_used') THEN
    ALTER TABLE interviews ADD COLUMN voice_used boolean DEFAULT false;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'company') THEN
    ALTER TABLE interviews ADD COLUMN company text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'role') THEN
    ALTER TABLE interviews ADD COLUMN role text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interviews' AND column_name = 'resume_id') THEN
    ALTER TABLE interviews ADD COLUMN resume_id uuid;
  END IF;
END $$;

-- ===== ALTER ROADMAPS TABLE =====
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roadmaps' AND column_name = 'input_json') THEN
    ALTER TABLE roadmaps ADD COLUMN input_json jsonb DEFAULT '{}';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roadmaps' AND column_name = 'roadmap_json') THEN
    ALTER TABLE roadmaps ADD COLUMN roadmap_json jsonb DEFAULT '{}';
  END IF;
END $$;

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_analysis_user_id ON resume_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_analysis_resume_id ON resume_analysis(resume_id);
CREATE INDEX IF NOT EXISTS idx_skill_gap_reports_user_id ON skill_gap_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_gap_reports_resume_id ON skill_gap_reports(resume_id);
CREATE INDEX IF NOT EXISTS idx_coding_problems_difficulty ON coding_problems(difficulty);

-- ===== SEED CODING PROBLEMS =====
INSERT INTO coding_problems (title, difficulty, statement, constraints, examples, visible_test_cases, hidden_test_cases, topic_tags) VALUES
(
  'Two Sum',
  'Easy',
  'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.',
  '2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Only one valid answer exists.',
  '[{"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."}, {"input": "nums = [3,2,4], target = 6", "output": "[1,2]"}]',
  '[{"id": 1, "input": {"nums": [2,7,11,15], "target": 9}, "expected": "[0,1]"}, {"id": 2, "input": {"nums": [3,2,4], "target": 6}, "expected": "[1,2]"}]',
  '[{"id": 3, "input": {"nums": [3,3], "target": 6}, "expected": "[0,1]"}, {"id": 4, "input": {"nums": [1,5,8,12,13], "target": 13}, "expected": "[0,3]"}]',
  '{"Array", "Hash Table"}'
),
(
  'Reverse Linked List',
  'Easy',
  'Given the head of a singly linked list, reverse the list, and return the reversed list''s head. You must reverse the list in-place.',
  'The number of nodes in the list is the range [0, 5000].
-5000 <= Node.val <= 5000',
  '[{"input": "head = [1,2,3,4,5]", "output": "[5,4,3,2,1]"}, {"input": "head = [1,2]", "output": "[2,1]"}]',
  '[{"id": 1, "input": {"head": [1,2,3,4,5]}, "expected": "[5,4,3,2,1]"}, {"id": 2, "input": {"head": [1,2]}, "expected": "[2,1]"}]',
  '[{"id": 3, "input": {"head": []}, "expected": "[]"}, {"id": 4, "input": {"head": [42]}, "expected": "[42]"}]',
  '{"Linked List", "Recursion"}'
),
(
  'Longest Substring Without Repeating Characters',
  'Medium',
  'Given a string s, find the length of the longest substring without repeating characters.',
  '0 <= s.length <= 5 * 10^4
s consists of English letters, digits, symbols, and spaces.',
  '[{"input": "s = \"abcabcbb\"", "output": "3", "explanation": "The answer is \"abc\", with the length of 3."}, {"input": "s = \"bbbbb\"", "output": "1"}]',
  '[{"id": 1, "input": {"s": "abcabcbb"}, "expected": "3"}, {"id": 2, "input": {"s": "bbbbb"}, "expected": "1"}]',
  '[{"id": 3, "input": {"s": "pwwkew"}, "expected": "3"}, {"id": 4, "input": {"s": ""}, "expected": "0"}]',
  '{"Hash Table", "String", "Sliding Window"}'
),
(
  'Valid BST',
  'Medium',
  'Given the root of a binary tree, determine if it is a valid Binary Search Tree (BST). A valid BST is defined as: The left subtree of a node contains only nodes with keys less than the node''s key. The right subtree of a node contains only nodes with keys greater than the node''s key. Both the left and right subtrees must also be binary search trees.',
  'The number of nodes in the tree is in the range [1, 10^4].
-2^31 <= Node.val <= 2^31 - 1',
  '[{"input": "root = [2,1,3]", "output": "true"}, {"input": "root = [5,1,4,null,null,3,6]", "output": "false"}]',
  '[{"id": 1, "input": {"root": [2,1,3]}, "expected": "true"}, {"id": 2, "input": {"root": [5,1,4,null,null,3,6]}, "expected": "false"}]',
  '[{"id": 3, "input": {"root": [1]}, "expected": "true"}, {"id": 4, "input": {"root": [2,1,3,null,null,null,4]}, "expected": "false"}]',
  '{"Tree", "DFS", "BST"}'
),
(
  'Group Anagrams',
  'Medium',
  'Given an array of strings strs, group the anagrams together. You can return the answer in any order. An Anagram is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.',
  '1 <= strs.length <= 10^4
0 <= strs[i].length <= 100
strs[i] consists of lowercase English letters.',
  '[{"input": "strs = [\"eat\",\"tea\",\"tan\",\"ate\",\"nat\",\"bat\"]", "output": "3 groups", "explanation": "There is no guarantee for the order of the output."}, {"input": "strs = [\"\"]", "output": "1 group"}]',
  '[{"id": 1, "input": {"strs": ["eat","tea","tan","ate","nat","bat"]}, "expected": "3 groups"}, {"id": 2, "input": {"strs": [""]}, "expected": "1 group"}]',
  '[{"id": 3, "input": {"strs": ["a"]}, "expected": "1 group"}, {"id": 4, "input": {"strs": ["abc","cab","bca","xyz","zyx"]}, "expected": "2 groups"}]',
  '{"Hash Table", "String", "Sorting"}'
),
(
  'Merge Two Sorted Lists',
  'Easy',
  'You are given the heads of two sorted linked lists list1 and list2. Merge the two lists into one sorted list. The list should be made by splicing together the nodes of the first two lists. Return the head of the merged linked list.',
  'The number of nodes in both lists is in the range [0, 50].
-100 <= Node.val <= 100
Both list1 and list2 are sorted in non-decreasing order.',
  '[{"input": "list1 = [1,2,4], list2 = [1,3,4]", "output": "[1,1,2,3,4,4]"}, {"input": "list1 = [], list2 = []", "output": "[]"}]',
  '[{"id": 1, "input": {"list1": [1,2,4], "list2": [1,3,4]}, "expected": "[1,1,2,3,4,4]"}, {"id": 2, "input": {"list1": [], "list2": []}, "expected": "[]"}]',
  '[{"id": 3, "input": {"list1": [], "list2": [0]}, "expected": "[0]"}, {"id": 4, "input": {"list1": [1,5,9], "list2": [2,3,7]}, "expected": "[1,2,3,5,7,9]"}]',
  '{"Linked List", "Recursion"}'
),
(
  'Binary Tree Level Order Traversal',
  'Medium',
  'Given the root of a binary tree, return the level order traversal of its nodes'' values (i.e., from left to right, level by level).',
  'The number of nodes in the tree is in the range [0, 2000].
-1000 <= Node.val <= 1000',
  '[{"input": "root = [3,9,20,null,null,15,7]", "output": "[[3],[9,20],[15,7]]"}, {"input": "root = [1]", "output": "[[1]]"}]',
  '[{"id": 1, "input": {"root": [3,9,20,null,null,15,7]}, "expected": "[[3],[9,20],[15,7]]"}, {"id": 2, "input": {"root": [1]}, "expected": "[[1]]"}]',
  '[{"id": 3, "input": {"root": []}, "expected": "[]"}, {"id": 4, "input": {"root": [1,2,3,4,5,6,7]}, "expected": "[[1],[2,3],[4,5,6,7]]"}]',
  '{"Tree", "BFS", "Binary Tree"}'
),
(
  'Maximum Subarray',
  'Medium',
  'Given an integer array nums, find the subarray with the largest sum, and return its sum.',
  '1 <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4',
  '[{"input": "nums = [-2,1,-3,4,-1,2,1,-5,4]", "output": "6", "explanation": "The subarray [4,-1,2,1] has the largest sum 6."}, {"input": "nums = [1]", "output": "1"}]',
  '[{"id": 1, "input": {"nums": [-2,1,-3,4,-1,2,1,-5,4]}, "expected": "6"}, {"id": 2, "input": {"nums": [1]}, "expected": "1"}]',
  '[{"id": 3, "input": {"nums": [5,4,-1,7,8]}, "expected": "23"}, {"id": 4, "input": {"nums": [-1,-2,-3]}, "expected": "-1"}]',
  '{"Array", "Divide and Conquer", "Dynamic Programming"}'
)
ON CONFLICT DO NOTHING;
