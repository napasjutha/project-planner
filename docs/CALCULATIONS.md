# Estimator Calculation Logic

This document provides a comprehensive reference for all calculation logic in the Project Planner estimator.

## Table of Contents
1. [Base Numbers](#base-numbers)
2. [Single Requirement Calculation](#single-requirement-calculation)
3. [High-Level Calculations](#high-level-calculations)
4. [Summary Aggregation](#summary-aggregation)
5. [Configurable vs Fixed Parameters](#configurable-vs-fixed-parameters)
6. [Examples](#examples)

---

## Base Numbers

### Complexity Multipliers (Risk Buffers)
**Fixed - Cannot be changed in UI**

```javascript
Low:    1.10  (10% buffer)
Medium: 1.21  (21% buffer)
High:   1.375 (37.5% buffer)
```

These multipliers are applied to base hours to account for uncertainty and risk.

---

### Base Hours by Solution Type and Complexity
**Fixed - Cannot be changed in UI**

Each solution type has 8 activities with base hour estimates for 3 complexity levels:

#### OOTB (Out of the Box)
```
Activity        Low    Medium   High
Discovery        2       5       8
Requirements     1       4       8
Design           1       6      16
Development      2       8      16
Testing          1       2       8
UAT              1       4       8
Deployment       2       4       8
Documentation    1       1       2
-----------------------------------------
Total           11      34      74
```

#### Configuration
```
Activity        Low    Medium   High
Discovery        4       6      12
Requirements     4      12      24
Design           4      12      24
Development      6      12      32
Testing          2       4      16
UAT              2       4      16
Deployment       4       4       8
Documentation    1       3       4
-----------------------------------------
Total           27      57     136
```

#### Customization
```
Activity        Low    Medium   High
Discovery        5       8      24
Requirements    10      16      40
Design           4      24      32
Development      8      32      56
Testing          4      10      20
UAT              4      10      20
Deployment       4       8       8
Documentation    1       4       4
-----------------------------------------
Total           40     112     204
```

#### Integration
```
Activity        Low    Medium   High
Discovery        8      24      32
Requirements    10      24      40
Design          24      32      60
Development     24      40      80
Testing          8      32      40
UAT              8      32      40
Deployment       4       8      16
Documentation    5       8      12
-----------------------------------------
Total           91     200     320
```

#### Migration
```
Activity        Low    Medium   High
Discovery       16      32      40
Requirements    16      24      40
Design          24      32      60
Development     18      80     120
Testing          8      32      40
UAT              8      32      32
Deployment       8      16      24
Documentation   10      17      28
-----------------------------------------
Total          108     265     384
```

---

### Powered Stages Distribution
**Configurable in UI - Default values:**

```javascript
Vision:    12%  (0.12)
Validate:  34%  (0.34)
Construct: 36%  (0.36)
Deploy:    10%  (0.10)
Evolve:     8%  (0.08)
--------------------------
Total:    100%  (1.00)
```

**Note:** User can adjust these percentages in the Parameters dropdown. The UI validates that they sum to 100%.

---

### Role Allocation by Powered Stage
**Fixed - Cannot be changed in UI**

Each role receives a percentage of each Powered Stage's effort:

```
Role                         Vision  Validate  Construct  Deploy  Evolve
Engagement Management         10%      5%        5%        5%      5%
Delivery Management           30%     20%       10%       10%     20%
Solution Architect/Analyst    50%     25%       15%       10%     20%
Developer                     10%     30%       50%       40%     45%
QA                             0%     20%       20%       35%     10%
--------------------------------------------------------------------------
Total per stage              100%    100%      100%      100%    100%
```

**Note:** Each column sums to 100% (all effort in a stage is allocated to roles).

---

### Overhead Percentages
**Configurable in UI - Default values:**

```javascript
Contingency:        10%  (0.10)
Project Management: 20%  (0.20)
Change Management:  20%  (0.20)
Confidence:        100%  (1.00)  // Not used in calculations currently
```

---

## Single Requirement Calculation

### Step 1: Get Base Hours
Look up base hours from `BASE_HOURS[solutionType][complexity]`

**Example:** Configuration + Medium = 57 hours total

### Step 2: Apply Complexity Multiplier
```
adjusted_hours = total_base_hours × COMPLEXITY_MULTIPLIER[complexity]
```

**Example:** 57 × 1.21 = 68.97 hours

### Step 3: Convert to Days
```
total_days = adjusted_hours ÷ 8
```

**Example:** 68.97 ÷ 8 = 8.62 days

### Step 4: Calculate by Activity
```
byActivity[activity] = (base_hours[activity] × complexity_multiplier) ÷ 8
```

**Example for Discovery (Configuration Medium):**
```
6 × 1.21 ÷ 8 = 0.91 days
```

### Step 5: Distribute to Powered Stages
```
byStage[stage] = total_days × stage_percentage
```

**Example (using default 12%, 34%, 36%, 10%, 8%):**
```
Vision:    8.62 × 0.12 = 1.03 days
Validate:  8.62 × 0.34 = 2.93 days
Construct: 8.62 × 0.36 = 3.10 days
Deploy:    8.62 × 0.10 = 0.86 days
Evolve:    8.62 × 0.08 = 0.69 days
```

### Step 6: Allocate Stages to Roles
```
byRole[role] = Σ(byStage[stage] × ROLE_ALLOCATION_BY_STAGE[role][stage])
```

**Example for Developer:**
```
Developer = (1.03 × 0.10) + (2.93 × 0.30) + (3.10 × 0.50) + (0.86 × 0.40) + (0.69 × 0.45)
          = 0.103 + 0.879 + 1.550 + 0.344 + 0.311
          = 3.19 days
```

**Complete role breakdown for this example:**
```
Engagement Management:      0.62 days
Delivery Management:        1.23 days
Solution Architect/Analyst: 1.58 days
Developer:                  3.19 days
QA:                         2.00 days
-------------------------------------------
Total:                      8.62 days ✓
```

---

## High-Level Calculations

### Feature-Based High-Level
User specifies component counts per feature (e.g., "Login: 2 low, 3 medium, 1 high")

**Algorithm:**
1. For each complexity level with count > 0:
   - Calculate as Configuration requirement with that complexity
   - Multiply result by count
2. Sum all results

**Example:** Feature "Login" with 2 Low + 3 Medium + 1 High
```
Low:    calculateRequirement({solutionType: 'Configuration', complexity: 'Low'})    × 2
Medium: calculateRequirement({solutionType: 'Configuration', complexity: 'Medium'}) × 3
High:   calculateRequirement({solutionType: 'Configuration', complexity: 'High'})   × 1

Using base hours from table above:
Low:    (27 × 1.10 ÷ 8) × 2 = 3.71 × 2 = 7.43 days
Medium: (57 × 1.21 ÷ 8) × 3 = 8.62 × 3 = 25.87 days
High:   (136 × 1.375 ÷ 8) × 1 = 23.38 × 1 = 23.38 days
---------------------------------------------------------
Total: 56.68 days (before overheads)
```

### MoSCoW-Based High-Level
Legacy mode - calculates by MoSCoW priority instead of feature names. Uses same underlying logic.

---

## Summary Aggregation

### Detailed Mode
Sum across all requirements in the requirements table:

```
summary.totalDays       = Σ requirement.totalDays
summary.byFeature[f]    = Σ requirement.totalDays where requirement.feature = f
summary.byStage[s]      = Σ requirement.byStage[s]
summary.byRole[r]       = Σ requirement.byRole[r]
summary.bySolutionType[t] = Σ requirement.totalDays where requirement.solutionType = t
summary.byActivity[a]   = Σ requirement.byActivity[a]
```

### High-Level Mode
Sum across all features in the high-level matrix:

```
For each feature with counts {low, medium, high}:
  calc = calculateHighLevelFeature(counts, params)
  summary.totalDays += calc.totalDays
  summary.byFeature[feature] = calc.totalDays
  (merge byStage, byRole, byActivity)
```

### Add Integrations
If `integrationsCount > 0`:
```
integration_calc = calculateRequirement({
  solutionType: 'Integration',
  complexity: 'Medium',
  feature: 'Integration'
}, params)

Add (integration_calc × integrationsCount) to all summary buckets
```

### Add Migrations
If `migrationsCount > 0`:
```
migration_calc = calculateRequirement({
  solutionType: 'Migration',
  complexity: 'Medium',
  feature: 'Migration'
}, params)

Add (migration_calc × migrationsCount) to all summary buckets
```

### Apply Overheads (Multiplicative)
**Critical:** Overheads are applied multiplicatively (sequentially), not additively.

```javascript
overhead_multiplier = (1 + contingencyPct)
                    × (1 + projectManagementPct)
                    × (1 + changeManagementPct)

summary.totalDays       × overhead_multiplier
summary.byStage[*]      × overhead_multiplier  ✓
summary.byRole[*]       × overhead_multiplier  ✓
summary.bySolutionType[*] × overhead_multiplier  ✓
summary.byFeature[*]    (NO overhead applied)  ✗
summary.byActivity[*]   (NO overhead applied)  ✗
```

**Example with defaults (10%, 20%, 20%):**
```
overhead_multiplier = 1.10 × 1.20 × 1.20 = 1.584

100 days base effort becomes:
100 × 1.584 = 158.4 days final
```

**Why multiplicative?** Matches Excel calculation and industry standard. Overheads compound:
- Base effort: 100 days
- + 10% contingency: 110 days
- + 20% PM (on 110): 110 × 1.20 = 132 days
- + 20% change (on 132): 132 × 1.20 = 158.4 days

**Not:** 100 × (1 + 0.10 + 0.20 + 0.20) = 150 days ✗

---

## Configurable vs Fixed Parameters

### ✅ Configurable in UI

| Parameter | Location | Default | Range | Notes |
|-----------|----------|---------|-------|-------|
| Powered Stage Distribution | Parameters dropdown | Vision: 12%, Validate: 34%, Construct: 36%, Deploy: 10%, Evolve: 8% | 0-100% each | Must sum to 100% (validated) |
| Contingency % | Parameters dropdown | 10% | 0-100% | Applied multiplicatively |
| Confidence % | Parameters dropdown | 100% | 0-100% | Currently not used in calculations |
| Change Management % | Parameters dropdown | 20% | 0-100% | Applied multiplicatively |
| Project Management % | Parameters dropdown | 20% | 0-100% | Applied multiplicatively |
| Integrations Count | Parameters dropdown | 0 | 0+ | Each integration = Medium complexity Integration type |
| Migrations Count | Parameters dropdown | 0 | 0+ | Each migration = Medium complexity Migration type |
| Features | Parameters dropdown | [] | Any strings | User-defined feature names |
| Phases | Parameters dropdown | ["1", "2"] | Any strings | User-defined release phase names |

### ❌ Fixed (Hardcoded)

| Parameter | Value | Location in Code |
|-----------|-------|------------------|
| Complexity Multipliers | Low: 1.10, Medium: 1.21, High: 1.375 | `estimatorEngine.js:12-16` |
| Base Hours (all solution types) | See tables above | `estimatorEngine.js:20-46` |
| Role Allocation by Stage | See table above | `estimatorEngine.js:58-64` |
| Hours per Day | 8 | Hardcoded in division throughout |
| Integration Default Complexity | Medium | `estimatorEngine.js:337` |
| Migration Default Complexity | Medium | `estimatorEngine.js:366` |
| High-Level Default Solution Type | Configuration | `estimatorEngine.js:157, 206` |

---

## Examples

### Example 1: Simple Configuration Requirement

**Input:**
- Solution Type: Configuration
- Complexity: Medium
- Powered Stages: Default (12%, 34%, 36%, 10%, 8%)
- Overheads: Default (10%, 20%, 20%)

**Calculation:**

1. **Base Hours:** 57 (from Configuration Medium table)

2. **Apply Multiplier:** 57 × 1.21 = 68.97 hours

3. **Convert to Days:** 68.97 ÷ 8 = 8.62 days

4. **By Activity:**
   - Discovery: 6 × 1.21 ÷ 8 = 0.91 days
   - Requirements: 12 × 1.21 ÷ 8 = 1.82 days
   - Design: 12 × 1.21 ÷ 8 = 1.82 days
   - Development: 12 × 1.21 ÷ 8 = 1.82 days
   - Testing: 4 × 1.21 ÷ 8 = 0.61 days
   - UAT: 4 × 1.21 ÷ 8 = 0.61 days
   - Deployment: 4 × 1.21 ÷ 8 = 0.61 days
   - Documentation: 3 × 1.21 ÷ 8 = 0.45 days
   - **Total: 8.62 days** ✓

5. **By Powered Stage:**
   - Vision: 8.62 × 0.12 = 1.03 days
   - Validate: 8.62 × 0.34 = 2.93 days
   - Construct: 8.62 × 0.36 = 3.10 days
   - Deploy: 8.62 × 0.10 = 0.86 days
   - Evolve: 8.62 × 0.08 = 0.69 days
   - **Total: 8.62 days** ✓

6. **By Role:**
   - Engagement Management: (1.03×0.10)+(2.93×0.05)+(3.10×0.05)+(0.86×0.05)+(0.69×0.05) = 0.62 days
   - Delivery Management: (1.03×0.30)+(2.93×0.20)+(3.10×0.10)+(0.86×0.10)+(0.69×0.20) = 1.23 days
   - Solution Architect/Analyst: (1.03×0.50)+(2.93×0.25)+(3.10×0.15)+(0.86×0.10)+(0.69×0.20) = 1.58 days
   - Developer: (1.03×0.10)+(2.93×0.30)+(3.10×0.50)+(0.86×0.40)+(0.69×0.45) = 3.19 days
   - QA: (1.03×0.00)+(2.93×0.20)+(3.10×0.20)+(0.86×0.35)+(0.69×0.10) = 2.00 days
   - **Total: 8.62 days** ✓

7. **Single Requirement Result (before overheads):**
   ```
   totalDays: 8.62
   ```

**Note:** In detailed mode, overheads are NOT applied to individual requirements. They're applied to the final summary total.

---

### Example 2: Project with Multiple Requirements + Overheads

**Input:**
- Requirement 1: Configuration Medium (8.62 days from Example 1)
- Requirement 2: Customization High (28.03 days calculated similarly)
- Requirement 3: Integration Low (12.51 days calculated similarly)
- Integrations Count: 2
- Migrations Count: 1
- Overheads: 10% contingency, 20% PM, 20% change

**Calculation:**

1. **Sum Requirements:**
   ```
   8.62 + 28.03 + 12.51 = 49.16 days
   ```

2. **Add Integrations (2 × Medium Integration):**
   ```
   Integration Medium = (200 × 1.21 ÷ 8) = 30.25 days
   30.25 × 2 = 60.50 days
   Total: 49.16 + 60.50 = 109.66 days
   ```

3. **Add Migrations (1 × Medium Migration):**
   ```
   Migration Medium = (265 × 1.21 ÷ 8) = 40.08 days
   40.08 × 1 = 40.08 days
   Total: 109.66 + 40.08 = 149.74 days
   ```

4. **Apply Overheads (Multiplicative):**
   ```
   overhead_multiplier = 1.10 × 1.20 × 1.20 = 1.584
   Final: 149.74 × 1.584 = 237.18 days
   ```

5. **Final Summary:**
   ```
   totalDays: 237.18

   byStage (with overheads):
     Vision:    237.18 × 0.12 = 28.46 days
     Validate:  237.18 × 0.34 = 80.64 days
     Construct: 237.18 × 0.36 = 85.38 days
     Deploy:    237.18 × 0.10 = 23.72 days
     Evolve:    237.18 × 0.08 = 18.97 days

   byRole (with overheads):
     Engagement Management:      14.23 days
     Delivery Management:        29.20 days
     Solution Architect/Analyst: 37.54 days
     Developer:                  89.87 days
     QA:                         66.33 days

   byFeature (NO overheads - base values):
     [Shows 149.74 total split by features]

   byActivity (NO overheads - base values):
     [Shows 149.74 total split by activities]
   ```

---

### Example 3: High-Level Feature Estimation

**Input:**
- Feature "User Management" with:
  - 3 Low complexity components
  - 5 Medium complexity components
  - 2 High complexity components
- Solution Type: Configuration (default for high-level)
- Powered Stages: Default
- Overheads: Default

**Calculation:**

1. **Calculate Each Complexity Level:**
   ```
   Low:    (27 × 1.10 ÷ 8) × 3 = 3.71 × 3 = 11.14 days
   Medium: (57 × 1.21 ÷ 8) × 5 = 8.62 × 5 = 43.11 days
   High:   (136 × 1.375 ÷ 8) × 2 = 23.38 × 2 = 46.75 days
   ```

2. **Sum for Feature:**
   ```
   Total: 11.14 + 43.11 + 46.75 = 101.00 days (before overheads)
   ```

3. **Apply Overheads:**
   ```
   Final: 101.00 × 1.584 = 160.08 days
   ```

4. **Result:**
   ```
   summary.totalDays: 160.08
   summary.byFeature["User Management"]: 101.00 (NO overhead)
   summary.byStage[*]: 160.08 split by percentages (WITH overhead)
   summary.byRole[*]: 160.08 split by allocations (WITH overhead)
   ```

---

## Special Notes

### 1. Primary vs Additional Solution Types
Requirements can have multiple solution types (tags), but only the **first** (primary) is used for calculations:
```javascript
solutionTypes: ['Configuration', 'Integration', 'Customization']
                 ^^^^^^^^^^^^^^
                 Only this is used for effort calculation
```

### 2. Overhead Application Rules
- ✅ Applied to: `totalDays`, `byStage`, `byRole`, `bySolutionType`
- ❌ NOT applied to: `byFeature`, `byActivity`
- Why? Matches Excel behavior where feature and activity breakdowns show base effort

### 3. Integration/Migration Default Complexity
Always calculated as **Medium** complexity regardless of user input:
```javascript
// Hardcoded in estimatorEngine.js
Integration: always 'Medium' complexity
Migration:   always 'Medium' complexity
```

### 4. High-Level Default Solution Type
High-level estimates always use **Configuration** as the solution type:
```javascript
// Hardcoded in estimatorEngine.js:157, 206
calculateRequirement({ solutionType: 'Configuration', complexity: ... })
```

### 5. Rounding
No rounding is applied during calculations. All intermediate values use full precision. UI displays typically show 1-2 decimal places.

### 6. Validation
- Powered Stages must sum to 100% (±0.01% tolerance)
- All numeric inputs validate min/max ranges in UI
- Negative values are prevented

---

## File Reference

All calculation logic is implemented in:
```
src/js/estimatorEngine.js
```

Key functions:
- `calculateRequirement(req, params)` - Single requirement calculation
- `calculateHighLevelFeature(counts, params)` - High-level feature calculation
- `recalcSummary(estimator)` - Full project summary aggregation

Constants exported:
- `COMPLEXITY_MULTIPLIER`
- `BASE_HOURS`
- `POWERED_STAGES`
- `ROLE_ALLOCATION_BY_STAGE`
