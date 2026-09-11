# Operations Section Improvements

## Files to Modify

### 1. `/workspace/app/frontend/src/lib/api.ts`
- Add `updateStatus` method to `preOrderApi`
- Add `getById` method to `preOrderApi`

### 2. `/workspace/app/frontend/src/pages/MenuManagement.tsx` (rewrite)
- Dynamic categories from `mealCategoryApi.getAll()`
- Image upload via `uploadApi.uploadImage()`
- Bulk actions (delete, toggle availability) with checkbox selection
- Sorting by name, price, category, calories
- Nutritional badges (healthy icon, allergen warnings) prominent in table
- Card/grid view toggle
- Category item count in filter area
- Pagination (20 items per page)
- Image preview in form dialog

### 3. `/workspace/app/frontend/src/pages/MealCategoryManagement.tsx` (rewrite)
- Color picker for each category
- Icon selection from preset Lucide icons
- Menu item count per category
- Up/down arrow reordering for display_order
- Visual preview card
- Better empty state

### 4. `/workspace/app/frontend/src/pages/PreOrders.tsx` (rewrite)
- Replace localStorage with real backend API (`preOrderApi`)
- Date range filtering (today, this week, custom)
- Order detail view dialog
- Bulk status update
- Today's Orders summary dashboard
- Print/export functionality
- Auto-refresh toggle