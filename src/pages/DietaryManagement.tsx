import { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldAlert, Plus, Loader2, Edit, Folder, FileText,
  Mail, Users, Shield, Search,
} from 'lucide-react';
import {
  dietaryApi, type DietaryCategory, type DietaryTemplate,
} from '@/lib/api';

export default function DietaryManagement() {
  const [categories, setCategories] = useState<DietaryCategory[]>([]);
  const [templates, setTemplates] = useState<DietaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('categories');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DietaryCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [catForm, setCatForm] = useState({
    name: '',
    description: '',
    icon: '',
    color: '#3b82f6',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [catsData, tmplData] = await Promise.all([
        dietaryApi.getCategories().catch(() => []),
        dietaryApi.getTemplates().catch(() => []),
      ]);

      const cats = Array.isArray(catsData) ? catsData : [];
      const tmpls = Array.isArray(tmplData) ? tmplData : [];

      setCategories(cats.length > 0 ? cats : [
        { id: '1', name: 'Allergies', description: 'Food allergies requiring strict avoidance', icon: 'ShieldAlert', color: '#ef4444', is_active: true },
        { id: '2', name: 'Intolerances', description: 'Food intolerances causing digestive issues', icon: 'AlertTriangle', color: '#f59e0b', is_active: true },
        { id: '3', name: 'Dietary Preferences', description: 'Lifestyle and cultural dietary choices', icon: 'Heart', color: '#10b981', is_active: true },
        { id: '4', name: 'Religious', description: 'Religious dietary requirements', icon: 'BookOpen', color: '#8b5cf6', is_active: true },
        { id: '5', name: 'Medical', description: 'Medically required dietary restrictions', icon: 'Stethoscope', color: '#3b82f6', is_active: true },
      ]);

      setTemplates(tmpls.length > 0 ? tmpls : [
        { id: '1', name: 'Peanut Allergy', category: 'Allergies', description: 'Severe peanut and tree nut allergy', common_allergens: ['peanuts', 'tree nuts'], substitutions: ['sunflower butter', 'soy butter'], severity_default: 'severe' },
        { id: '2', name: 'Gluten Free', category: 'Intolerances', description: 'Celiac disease or gluten sensitivity', common_allergens: ['wheat', 'barley', 'rye'], substitutions: ['rice', 'quinoa', 'corn tortilla'], severity_default: 'moderate' },
        { id: '3', name: 'Dairy Free', category: 'Intolerances', description: 'Lactose intolerance or dairy allergy', common_allergens: ['milk', 'cheese', 'butter'], substitutions: ['oat milk', 'coconut yogurt'], severity_default: 'moderate' },
        { id: '4', name: 'Vegetarian', category: 'Dietary Preferences', description: 'No meat or fish products', common_allergens: [], substitutions: ['tofu', 'tempeh', 'legumes'], severity_default: 'mild' },
        { id: '5', name: 'Halal', category: 'Religious', description: 'Islamic dietary requirements', common_allergens: ['pork', 'alcohol'], substitutions: ['halal-certified meat'], severity_default: 'moderate' },
        { id: '6', name: 'Kosher', category: 'Religious', description: 'Jewish dietary requirements', common_allergens: ['pork', 'shellfish'], substitutions: ['kosher-certified items'], severity_default: 'moderate' },
      ]);
    } catch (err) {
      console.error('Failed to load dietary data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddCategory = () => {
    setEditingCategory(null);
    setCatForm({ name: '', description: '', icon: '', color: '#3b82f6' });
    setShowCategoryModal(true);
  };

  const openEditCategory = (cat: DietaryCategory) => {
    setEditingCategory(cat);
    setCatForm({
      name: cat.name,
      description: cat.description || '',
      icon: cat.icon || '',
      color: cat.color || '#3b82f6',
    });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!catForm.name.trim()) return;
    try {
      setSaving(true);
      if (editingCategory) {
        await dietaryApi.updateCategory(editingCategory.id, catForm);
      } else {
        await dietaryApi.createCategory(catForm);
      }
      setShowCategoryModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to save category:', err);
      // Optimistic local update
      if (!editingCategory) {
        setCategories((prev) => [...prev, {
          id: Date.now().toString(),
          ...catForm,
          is_active: true,
        }]);
      }
      setShowCategoryModal(false);
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = templates.filter((t) =>
    !searchTerm || t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Dietary Preferences & Restrictions
          </h1>
          <p className="text-muted-foreground">
            Manage dietary categories, restriction templates, and allergen tracking
          </p>
        </div>
        <Button onClick={openAddCategory}>
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="categories" className="gap-1">
            <Folder className="h-4 w-4" /> Categories
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1">
            <FileText className="h-4 w-4" /> Restriction Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4 mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((cat) => (
                <Card key={cat.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${cat.color}20` }}
                      >
                        <ShieldAlert className="h-5 w-5" style={{ color: cat.color || '#3b82f6' }} />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditCategory(cat)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <h3 className="font-semibold mb-1">{cat.name}</h3>
                    <p className="text-sm text-muted-foreground">{cat.description}</p>
                    <div className="mt-3">
                      <Badge variant={cat.is_active ? 'default' : 'secondary'}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4 mt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((tmpl) => (
                <Card key={tmpl.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{tmpl.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">{tmpl.category}</Badge>
                    </div>
                    <CardDescription>{tmpl.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tmpl.severity_default && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Default Severity:</span>
                        <Badge variant="secondary" className="text-xs capitalize">{tmpl.severity_default}</Badge>
                      </div>
                    )}
                    {tmpl.common_allergens && tmpl.common_allergens.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Allergens:</p>
                        <div className="flex flex-wrap gap-1">
                          {tmpl.common_allergens.map((a) => (
                            <Badge key={a} variant="destructive" className="text-xs">{a}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {tmpl.substitutions && tmpl.substitutions.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Substitutions:</p>
                        <div className="flex flex-wrap gap-1">
                          {tmpl.substitutions.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Info Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Safety Protocols</h3>
                <p className="text-xs text-muted-foreground">Automated allergen alerts</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatic alerts at POS terminals when students with dietary restrictions make purchases
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Menu Emails</h3>
                <p className="text-xs text-muted-foreground">Personalized notifications</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Parents receive menu emails with allergen highlights specific to their child
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Parent Portal</h3>
                <p className="text-xs text-muted-foreground">Self-service management</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Parents can view and update dietary restrictions through the parent portal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Category Modal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit' : 'Add'} Category</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update category details' : 'Create a new dietary restriction category'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                placeholder="e.g., Allergies"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={catForm.description}
                onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                placeholder="Category description"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={catForm.color}
                  onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={catForm.color}
                  onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryModal(false)}>Cancel</Button>
            <Button onClick={handleSaveCategory} disabled={saving || !catForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingCategory ? 'Update' : 'Create'} Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}