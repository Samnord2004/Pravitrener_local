import React, { useMemo, useState } from 'react';
import {
  Plus,
  Layers,
  ShieldAlert,
  Play,
  Globe,
  EyeOff,
  Trash2,
  Pencil,
  Upload,
  X,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type {
  ClientProfile,
  Exercise,
  ExerciseLimbAngleMatrix,
  ExerciseLimbKey,
  ExerciseType,
  ExerciseVisibility,
  UserAccount,
  WorkoutProgram,
} from '../types';
import { apiRequest } from '../utils/api';
import {
  computeProgramDifficulty,
  EXERCISE_TYPE_OPTIONS,
  inferExerciseDifficulty,
  inferExerciseType,
} from '../utils/serviceCategories';
import { DifficultyStarPicker, DifficultyStars } from './DifficultyStars';

interface ExercisesLibraryProps {
  currentUser: UserAccount;
  exercises: Exercise[];
  programs: WorkoutProgram[];
  clients: ClientProfile[];
  readOnly?: boolean;
  onExerciseAdded: (ex: Exercise) => void;
  onExerciseUpdated?: (ex: Exercise) => void;
  onExerciseDeleted?: (id: string) => void;
  onProgramAdded: (prog: WorkoutProgram) => void;
  onProgramUpdated?: (prog: WorkoutProgram) => void;
  onProgramDeleted?: (id: string) => void;
  onLaunchProgramInSession?: (programId: string) => void;
}

const PRESET_PHOTOS = [
  {
    label: 'Горизонтальная звёздочка',
    url: '/src/assets/images/exercise_star_stretch_1795103073739.jpg',
  },
  {
    label: 'Диагональное скручивание',
    url: '/src/assets/images/exercise_twist_hang_1795103073130.jpg',
  },
  {
    label: 'Раскрытие грудного отдела',
    url: '/src/assets/images/exercise_shoulder_open_1795103072729.jpg',
  },
  {
    label: 'Тренажёр ПравИло (общий вид)',
    url: '/src/assets/images/studio_hero_pravilo_1795103073467.jpg',
  },
];

const LIMB_ROWS: { key: ExerciseLimbKey; label: string; short: string }[] = [
  { key: 'ln', label: 'Левая нога (ЛН)', short: 'ЛН' },
  { key: 'pn', label: 'Правая нога (ПН)', short: 'ПН' },
  { key: 'lr', label: 'Левая рука (ЛР)', short: 'ЛР' },
  { key: 'pr', label: 'Правая рука (ПР)', short: 'ПР' },
  { key: 'sh', label: 'Шея (Ш)', short: 'Ш' },
];

const STAND_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const ANGLE_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

function createDefaultLimbMatrix(): ExerciseLimbAngleMatrix {
  return {
    ln: { stand: 1, angle: 0 },
    pn: { stand: 1, angle: 0 },
    lr: { stand: 1, angle: 0 },
    pr: { stand: 1, angle: 0 },
    sh: { stand: 1, angle: 0 },
  };
}

function normalizeLimbMatrix(
  raw?: Partial<ExerciseLimbAngleMatrix> | null
): ExerciseLimbAngleMatrix {
  const base = createDefaultLimbMatrix();
  if (!raw) return base;
  for (const row of LIMB_ROWS) {
    const item = raw[row.key];
    if (item && typeof item === 'object') {
      const s = Math.round(Number(item.stand));
      const a = Math.round(Number(item.angle));
      base[row.key] = {
        stand: Number.isFinite(s) ? Math.max(1, Math.min(7, s)) : 1,
        angle: Number.isFinite(a) ? Math.max(0, Math.min(6, a)) : 0,
      };
    }
  }
  return base;
}

function formatLimbAnglesFromMatrix(matrix: ExerciseLimbAngleMatrix) {
  return {
    wrists: `ЛР ст.${matrix.lr.stand}/уг.${matrix.lr.angle} · ПР ст.${matrix.pr.stand}/уг.${matrix.pr.angle}`,
    ankles: `ЛН ст.${matrix.ln.stand}/уг.${matrix.ln.angle} · ПН ст.${matrix.pn.stand}/уг.${matrix.pn.angle}`,
    torsoAngle: `Ш ст.${matrix.sh.stand}/уг.${matrix.sh.angle}`,
  };
}

function compressExercisePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения'));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Пустой файл изображения'));
        return;
      }
      const img = new Image();
      img.onerror = () => resolve(rawUrl);
      img.onload = () => {
        const maxSide = 1400;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressed);
        } catch {
          resolve(rawUrl);
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

const LimbAngleMatrixEditor: React.FC<{
  matrix: ExerciseLimbAngleMatrix;
  onChange: (next: ExerciseLimbAngleMatrix) => void;
}> = ({ matrix, onChange }) => {
  const updateCell = (
    key: ExerciseLimbKey,
    field: 'stand' | 'angle',
    value: number
  ) => {
    onChange({
      ...matrix,
      [key]: {
        ...matrix[key],
        [field]: value,
      },
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium">
          Таблица по углам конечности
        </label>
        <span className="text-[11px] st-muted">
          Стойка 1–7 · Угол 0–6
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border st-border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="st-surface-muted border-b st-border text-left">
              <th className="px-3 py-2 font-semibold">Конечность</th>
              <th className="px-3 py-2 font-semibold w-28">Стойка</th>
              <th className="px-3 py-2 font-semibold w-28">Угол</th>
            </tr>
          </thead>
          <tbody className="divide-y st-border">
            {LIMB_ROWS.map((row) => {
              const cell = matrix[row.key] || { stand: 1, angle: 0 };
              return (
                <tr key={row.key} className="st-surface">
                  <td className="px-3 py-1.5 font-medium">
                    <span>{row.label}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      aria-label={`${row.label} — Стойка`}
                      value={cell.stand}
                      onChange={(e) =>
                        updateCell(row.key, 'stand', Number(e.target.value))
                      }
                      className="w-full px-2 py-1 text-xs font-mono rounded border st-border st-surface cursor-pointer"
                    >
                      {STAND_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      aria-label={`${row.label} — Угол`}
                      value={cell.angle}
                      onChange={(e) =>
                        updateCell(row.key, 'angle', Number(e.target.value))
                      }
                      className="w-full px-2 py-1 text-xs font-mono rounded border st-border st-surface cursor-pointer"
                    >
                      {ANGLE_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const ExercisesLibraryView: React.FC<ExercisesLibraryProps> = ({
  currentUser,
  exercises,
  programs,
  clients,
  readOnly,
  onExerciseAdded,
  onExerciseUpdated,
  onExerciseDeleted,
  onProgramAdded,
  onProgramUpdated,
  onProgramDeleted,
  onLaunchProgramInSession,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [exerciseTypeFilter, setExerciseTypeFilter] = useState<'all' | ExerciseType>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | ExerciseVisibility>('all');
  const [search, setSearch] = useState('');
  const [expandedExId, setExpandedExId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyExId, setBusyExId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [showAddEx, setShowAddEx] = useState(false);
  const [showCreateProgram, setShowCreateProgram] = useState(false);

  // Add Exercise Form
  const [exTitle, setExTitle] = useState('');
  const [exCat, setExCat] = useState<Exercise['category']>('Базовое вытяжение');
  const [exType, setExType] = useState<ExerciseType>('Декомпрессия');
  const [exDifficulty, setExDifficulty] = useState<number>(3);
  const [exVisibility, setExVisibility] = useState<ExerciseVisibility>('public');
  const [exImage, setExImage] = useState(PRESET_PHOTOS[0].url);
  const [exInstructions, setExInstructions] = useState('');
  const [exMuscles, setExMuscles] = useState(
    'Широчайшие мышцы спины, разгибатели позвоночника'
  );
  const [exLimbMatrix, setExLimbMatrix] = useState<ExerciseLimbAngleMatrix>(
    createDefaultLimbMatrix
  );
  const [exSafety, setExSafety] = useState('');
  const [exDuration, setExDuration] = useState(150);
  const [exLoadPct, setExLoadPct] = useState(70);
  const [addSaving, setAddSaving] = useState(false);

  // Edit Exercise Modal Form
  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCat, setEditCat] = useState<Exercise['category']>('Базовое вытяжение');
  const [editType, setEditType] = useState<ExerciseType>('Декомпрессия');
  const [editDifficulty, setEditDifficulty] = useState<number>(3);
  const [editVisibility, setEditVisibility] = useState<ExerciseVisibility>('public');
  const [editImage, setEditImage] = useState(PRESET_PHOTOS[0].url);
  const [editInstructions, setEditInstructions] = useState('');
  const [editMuscles, setEditMuscles] = useState('');
  const [editLimbMatrix, setEditLimbMatrix] = useState<ExerciseLimbAngleMatrix>(
    createDefaultLimbMatrix
  );
  const [editSafety, setEditSafety] = useState('');
  const [editDuration, setEditDuration] = useState(150);
  const [editLoadPct, setEditLoadPct] = useState(70);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Complex Program Form (Create & Edit)
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [progTitle, setProgTitle] = useState('');
  const [progLevel, setProgLevel] =
    useState<WorkoutProgram['level']>('Первая тренировка');
  const [progClientId, setProgClientId] = useState('');
  const [progDesc, setProgDesc] = useState('');
  const [progExerciseIds, setProgExerciseIds] = useState<string[]>([]);
  const [progExSearch, setProgExSearch] = useState('');
  const [progDiffFilter, setProgDiffFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [progSaving, setProgSaving] = useState(false);
  const [progError, setProgError] = useState('');
  const [confirmDeleteProgId, setConfirmDeleteProgId] = useState<string | null>(null);
  const [busyProgId, setBusyProgId] = useState<string | null>(null);

  const isOwner = currentUser.role === 'owner';

  const canToggleVisibility = (ex: Exercise) => {
    if (readOnly) return false;
    if (currentUser.role === 'owner' || currentUser.role === 'admin') return true;
    if (currentUser.role === 'trainer') {
      return (
        ex.createdByUserId === currentUser.id ||
        (!ex.createdByUserId && ex.createdBy === currentUser.name)
      );
    }
    return false;
  };

  const canManageProgram = (prog: WorkoutProgram) => {
    if (readOnly) return false;
    if (currentUser.role === 'owner' || currentUser.role === 'admin') return true;
    if (currentUser.role === 'trainer') {
      return (
        prog.createdByUserId === currentUser.id ||
        (!prog.createdByUserId && prog.createdBy === currentUser.name)
      );
    }
    return false;
  };

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      const catOk = categoryFilter === 'all' || ex.category === categoryFilter;
      const resolvedType = inferExerciseType(ex);
      const typeOk = exerciseTypeFilter === 'all' || resolvedType === exerciseTypeFilter;
      const diff = inferExerciseDifficulty(ex);
      const diffOk =
        difficultyFilter === 'all' ||
        (difficultyFilter === 'easy' && diff <= 2) ||
        (difficultyFilter === 'medium' && diff === 3) ||
        (difficultyFilter === 'hard' && diff >= 4);
      const exVis: ExerciseVisibility = ex.visibility === 'hidden' ? 'hidden' : 'public';
      const visOk = visibilityFilter === 'all' || exVis === visibilityFilter;
      const q = search.trim().toLowerCase();
      const searchOk =
        !q ||
        ex.title.toLowerCase().includes(q) ||
        resolvedType.toLowerCase().includes(q) ||
        ex.targetMuscles.some((m) => m.toLowerCase().includes(q));
      return catOk && typeOk && diffOk && visOk && searchOk;
    });
  }, [exercises, categoryFilter, exerciseTypeFilter, difficultyFilter, visibilityFilter, search]);

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressExercisePhoto(file);
      setter(dataUrl);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Не удалось загрузить изображение'
      );
    } finally {
      e.target.value = '';
    }
  };

  const openEditExercise = (ex: Exercise) => {
    setEditError('');
    setEditingEx(ex);
    setEditTitle(ex.title);
    setEditCat(ex.category);
    setEditType(inferExerciseType(ex));
    setEditDifficulty(inferExerciseDifficulty(ex));
    setEditVisibility(ex.visibility === 'hidden' ? 'hidden' : 'public');
    setEditImage(ex.imageUrl || PRESET_PHOTOS[0].url);
    setEditInstructions(ex.instructions || '');
    setEditMuscles(ex.targetMuscles.join(', '));
    setEditLimbMatrix(normalizeLimbMatrix(ex.limbAngleMatrix));
    setEditSafety(ex.safetyNotes || '');
    setEditDuration(ex.defaultDurationSec || 120);
    setEditLoadPct(ex.recommendedLoadPct || 70);
  };

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setAddSaving(true);
    try {
      const created = await apiRequest<Exercise>('/api/exercises', {
        method: 'POST',
        body: JSON.stringify({
          title: exTitle,
          category: exCat,
          exerciseType: exType,
          difficulty: exDifficulty,
          visibility: exVisibility,
          imageUrl: exImage,
          instructions: exInstructions,
          targetMuscles: exMuscles
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          limbAngles: formatLimbAnglesFromMatrix(exLimbMatrix),
          limbAngleMatrix: exLimbMatrix,
          safetyNotes: exSafety,
          defaultDurationSec: exDuration,
          recommendedLoadPct: exLoadPct,
        }),
      });
      onExerciseAdded(created);
      setShowAddEx(false);
      setExTitle('');
      setExInstructions('');
      setExSafety('');
      setExType('Декомпрессия');
      setExDifficulty(3);
      setExVisibility('public');
      setExImage(PRESET_PHOTOS[0].url);
      setExLimbMatrix(createDefaultLimbMatrix());
      setExDuration(150);
      setExLoadPct(70);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Не удалось сохранить упражнение'
      );
    } finally {
      setAddSaving(false);
    }
  };

  const handleSaveEditedExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEx) return;
    setEditError('');
    setEditSaving(true);
    try {
      const updated = await apiRequest<Exercise>(`/api/exercises/${editingEx.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          category: editCat,
          exerciseType: editType,
          difficulty: editDifficulty,
          visibility: editVisibility,
          imageUrl: editImage,
          instructions: editInstructions,
          targetMuscles: editMuscles
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          limbAngles: formatLimbAnglesFromMatrix(editLimbMatrix),
          limbAngleMatrix: editLimbMatrix,
          safetyNotes: editSafety,
          defaultDurationSec: Number(editDuration) || 120,
          recommendedLoadPct: Number(editLoadPct) || 70,
        }),
      });
      onExerciseUpdated?.(updated);
      setEditingEx(null);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Не удалось обновить упражнение'
      );
    } finally {
      setEditSaving(false);
    }
  };

  const handleSetExerciseType = async (
    ex: Exercise,
    nextType: ExerciseType
  ) => {
    if (inferExerciseType(ex) === nextType) return;
    setActionError('');
    setBusyExId(ex.id);
    try {
      const updated = await apiRequest<Exercise>(`/api/exercises/${ex.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ exerciseType: nextType }),
      });
      onExerciseUpdated?.(updated);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Не удалось изменить тип упражнения'
      );
    } finally {
      setBusyExId(null);
    }
  };

  const handleSetVisibility = async (
    ex: Exercise,
    nextVisibility: ExerciseVisibility
  ) => {
    if ((ex.visibility || 'public') === nextVisibility) return;
    setActionError('');
    setBusyExId(ex.id);
    try {
      const updated = await apiRequest<Exercise>(`/api/exercises/${ex.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visibility: nextVisibility }),
      });
      onExerciseUpdated?.(updated);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Не удалось изменить видимость'
      );
    } finally {
      setBusyExId(null);
    }
  };

  const handleDeleteExercise = async (exId: string) => {
    setActionError('');
    setBusyExId(exId);
    try {
      await apiRequest(`/api/exercises/${exId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (expandedExId === exId) setExpandedExId(null);
      onExerciseDeleted?.(exId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Удалять упражнения может только владелец'
      );
    } finally {
      setBusyExId(null);
    }
  };

  const toggleProgExercise = (id: string) => {
    setProgExerciseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const moveProgExercise = (index: number, dir: -1 | 1) => {
    setProgExerciseIds((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const openCreateProgramModal = () => {
    setEditingProgramId(null);
    setProgTitle('');
    setProgLevel('Первая тренировка');
    setProgClientId('');
    setProgDesc('');
    setProgExerciseIds([]);
    setProgExSearch('');
    setProgDiffFilter('all');
    setProgError('');
    setShowCreateProgram(true);
  };

  const openEditProgramModal = (prog: WorkoutProgram) => {
    setEditingProgramId(prog.id);
    setProgTitle(prog.title);
    setProgLevel(prog.level);
    setProgClientId(prog.clientId || '');
    setProgDesc(prog.description || '');
    setProgExerciseIds([...prog.exerciseIds]);
    setProgExSearch('');
    setProgDiffFilter('all');
    setProgError('');
    setShowCreateProgram(true);
  };

  const closeProgramModal = () => {
    setShowCreateProgram(false);
    setEditingProgramId(null);
    setProgError('');
    setProgExSearch('');
    setProgDiffFilter('all');
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progTitle.trim()) {
      setProgError('Укажите название комплексной программы');
      return;
    }
    setProgError('');
    setProgSaving(true);
    try {
      const exerciseIds = progExerciseIds.length
        ? progExerciseIds
        : [exercises[0]?.id].filter(Boolean);
      const payload = {
        title: progTitle.trim(),
        level: progLevel,
        clientId: progClientId || undefined,
        description: progDesc.trim(),
        exerciseIds,
      };
      if (editingProgramId) {
        const updated = await apiRequest<WorkoutProgram>(
          `/api/programs/${editingProgramId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }
        );
        onProgramUpdated?.(updated);
      } else {
        const created = await apiRequest<WorkoutProgram>('/api/programs', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onProgramAdded(created);
      }
      closeProgramModal();
    } catch (err) {
      setProgError(
        err instanceof Error ? err.message : 'Не удалось сохранить комплексную программу'
      );
    } finally {
      setProgSaving(false);
    }
  };

  const handleDeleteProgram = async (progId: string) => {
    setActionError('');
    setBusyProgId(progId);
    try {
      await apiRequest(`/api/programs/${progId}`, { method: 'DELETE' });
      setConfirmDeleteProgId(null);
      onProgramDeleted?.(progId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Не удалось удалить программу'
      );
    } finally {
      setBusyProgId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b st-border">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Поиск упражнения или мышцы..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border st-border st-surface min-w-[220px]"
          />
          <div className="flex flex-wrap items-center gap-1 p-1 st-surface-muted rounded-lg border st-border">
            {[
              'all',
              'Базовое вытяжение',
              'Ротация',
              'Грудной отдел',
              'Силовое удержание',
              'Восстановление',
            ].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap cursor-pointer ${
                  categoryFilter === c
                    ? 'st-surface font-medium shadow-sm'
                    : 'st-muted hover:opacity-90'
                }`}
              >
                {c === 'all' ? 'Все' : c}
              </button>
            ))}
          </div>

          <select
            aria-label="Фильтр по типу упражнения"
            value={exerciseTypeFilter}
            onChange={(e) => setExerciseTypeFilter(e.target.value as 'all' | ExerciseType)}
            className="px-3 py-1.5 text-xs rounded-lg border st-border st-surface cursor-pointer"
          >
            <option value="all">Все типы упражнений</option>
            {EXERCISE_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                Тип: {t}
              </option>
            ))}
          </select>

          <select
            aria-label="Фильтр по сложности"
            value={difficultyFilter}
            onChange={(e) =>
              setDifficultyFilter(e.target.value as 'all' | 'easy' | 'medium' | 'hard')
            }
            className="px-3 py-1.5 text-xs rounded-lg border st-border st-surface cursor-pointer"
          >
            <option value="all">Любая сложность ★</option>
            <option value="easy">1–2 ★ Мягкие</option>
            <option value="medium">3 ★ Средние</option>
            <option value="hard">4–5 ★ Сложные</option>
          </select>

          {currentUser.role !== 'client' && (
            <div className="flex items-center gap-1 p-1 st-surface-muted rounded-lg border st-border">
              {(
                [
                  ['all', 'Все видимые'],
                  ['public', 'Публичные'],
                  ['hidden', 'Скрытые'],
                ] as const
              ).map(([vk, vl]) => (
                <button
                  key={vk}
                  type="button"
                  onClick={() => setVisibilityFilter(vk)}
                  className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap cursor-pointer ${
                    visibilityFilter === vk
                      ? 'st-surface font-medium shadow-sm'
                      : 'st-muted hover:opacity-90'
                  }`}
                >
                  {vl}
                </button>
              ))}
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openCreateProgramModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg st-accent-bg text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Создать комплексную тренировку</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddEx(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border st-border st-surface text-xs font-medium hover:opacity-90 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить упражнение</span>
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {actionError}
        </div>
      )}

      {/* Saved Complex Programs Strip */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">
            Комплексные тренировочные программы
          </h3>
          <span className="text-xs st-muted font-mono tabular-nums">
            Всего программ: {programs.length}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {programs.map((prog) => {
            const client = clients.find((c) => c.id === prog.clientId);
            const canManage = canManageProgram(prog);
            const isConfirmingProgDelete = confirmDeleteProgId === prog.id;
            const isProgBusy = busyProgId === prog.id;
            const programExercises = prog.exerciseIds
              .map((eid) => exercises.find((ex) => ex.id === eid))
              .filter((ex): ex is Exercise => Boolean(ex));
            const progDiff = computeProgramDifficulty(programExercises);
            const totalMin = Math.max(
              1,
              Math.round(
                programExercises.reduce((acc, ex) => acc + ex.defaultDurationSec, 0) / 60
              )
            );
            return (
              <div
                key={prog.id}
                className="p-4 rounded-xl st-surface border st-border flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs st-accent-text font-medium">
                      {prog.level} {client ? `· ${client.name}` : '· Общая методика'}
                    </div>
                    {canManage && !isConfirmingProgDelete && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditProgramModal(prog)}
                          disabled={isProgBusy}
                          title="Выбрать упражнения и редактировать программу"
                          className="p-1.5 rounded-lg st-surface-muted border st-border hover:opacity-80 st-muted hover:text-inherit transition-opacity cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProgId(prog.id)}
                          disabled={isProgBusy}
                          title="Удалить комплексную программу"
                          className="p-1.5 rounded-lg st-surface-muted border st-border text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="font-display text-sm font-semibold mt-1">
                    {prog.title}
                  </div>
                  {programExercises.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <DifficultyStars
                        value={progDiff.avg}
                        size="xs"
                        showNumeric
                        showLabel
                      />
                      <span className="text-[11px] font-mono st-muted tabular-nums">
                        ~{totalMin} мин
                      </span>
                    </div>
                  )}
                  <p className="text-xs st-muted mt-1.5 line-clamp-2">
                    {prog.description || 'Без дополнительного описания'}
                  </p>
                  {programExercises.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {programExercises.slice(0, 4).map((ex, idx) => {
                        const d = inferExerciseDifficulty(ex);
                        return (
                          <span
                            key={`${prog.id}-${ex.id}-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md st-surface-muted border st-border text-[11px] max-w-full"
                            title={`${ex.title} · Сложность ${d}/5`}
                          >
                            <span className="truncate st-muted">
                              {idx + 1}. {ex.title}
                            </span>
                            <DifficultyStars value={d} size="xs" />
                          </span>
                        );
                      })}
                      {programExercises.length > 4 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md st-surface-muted border st-border text-[11px] st-muted">
                          +{programExercises.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-2.5 text-xs font-mono st-muted tabular-nums">
                    Упражнений: {prog.exerciseIds.length} · Автор: {prog.createdBy}
                  </div>
                </div>

                {isConfirmingProgDelete ? (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs">
                    <span className="text-rose-700 dark:text-rose-300 font-medium">
                      Удалить комплекс?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteProgram(prog.id)}
                        disabled={isProgBusy}
                        className="px-2.5 py-1 rounded bg-rose-600 text-white font-medium hover:opacity-90 cursor-pointer"
                      >
                        {isProgBusy ? '...' : 'Да'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProgId(null)}
                        disabled={isProgBusy}
                        className="px-2.5 py-1 rounded border st-border st-surface cursor-pointer"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  !readOnly && (
                    <div className="flex items-center gap-2">
                      {onLaunchProgramInSession && (
                        <button
                          type="button"
                          onClick={() => onLaunchProgramInSession(prog.id)}
                          className="inline-flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg st-surface-muted border st-border hover:opacity-90 text-xs font-medium transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Запустить в сессии</span>
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openEditProgramModal(prog)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border st-border st-surface hover:opacity-90 text-xs font-medium transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Упражнения</span>
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Exercises Cards — Collapsed by default (image + title only), expand on hover / tap */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">
            Каталог упражнений ({filteredExercises.length})
          </h3>
          <span className="text-xs st-muted">
            Наведите курсор на карточку (или нажмите на экране), чтобы раскрыть описание, таблицу углов и редактирование
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {filteredExercises.map((ex) => {
            const isExpanded = expandedExId === ex.id;
            const vis: ExerciseVisibility =
              ex.visibility === 'hidden' ? 'hidden' : 'public';
            const canToggle = canToggleVisibility(ex);
            const isBusy = busyExId === ex.id;
            const isConfirmingDelete = confirmDeleteId === ex.id;
            const limbMatrix = normalizeLimbMatrix(ex.limbAngleMatrix);

            return (
              <div
                key={ex.id}
                onMouseLeave={() => {
                  if (confirmDeleteId === ex.id) setConfirmDeleteId(null);
                }}
                className={`group relative rounded-xl st-surface border st-border transition-shadow duration-150 ${
                  isExpanded ? 'z-30 shadow-xl' : 'hover:z-30 hover:shadow-xl'
                }`}
              >
                {/* Compact Default State: ONLY Image and Title */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedExId((prev) => (prev === ex.id ? null : ex.id))
                  }
                  className="w-full text-left block focus:outline-none cursor-pointer"
                >
                  <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 overflow-hidden rounded-t-xl">
                    <img
                      src={ex.imageUrl}
                      alt={ex.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="px-3.5 py-2.5 rounded-b-xl group-hover:rounded-b-none flex items-center justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold truncate">
                      {ex.title}
                    </h4>
                    <DifficultyStars
                      value={inferExerciseDifficulty(ex)}
                      size="xs"
                      showNumeric
                      className="shrink-0"
                    />
                  </div>
                </button>

                {/* Hover / Tap Expanded Details Drawer */}
                <div
                  className={`${
                    isExpanded ? 'block' : 'hidden lg:group-hover:block'
                  } lg:absolute lg:left-[-1px] lg:right-[-1px] lg:top-[calc(100%-1px)] lg:z-30 rounded-b-xl st-surface border st-border shadow-xl p-4 space-y-3`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="st-muted font-mono tabular-nums">
                      {ex.category} · {Math.round(ex.defaultDurationSec / 60)} мин · Тяга ~
                      {ex.recommendedLoadPct}%
                      {ex.createdBy ? ` · ${ex.createdBy}` : ''}
                    </span>
                    <span className="text-[11px] font-medium st-accent-text">
                      {inferExerciseType(ex)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="st-muted">Сложность методики:</span>
                    <DifficultyStars
                      value={inferExerciseDifficulty(ex)}
                      size="sm"
                      showNumeric
                      showLabel
                    />
                  </div>

                  {!readOnly && canToggle && (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="st-muted">Тип упражнения:</span>
                      <select
                        disabled={isBusy}
                        value={inferExerciseType(ex)}
                        onChange={(e) =>
                          handleSetExerciseType(ex, e.target.value as ExerciseType)
                        }
                        className="px-2.5 py-1 text-xs rounded-lg border st-border st-surface cursor-pointer"
                      >
                        {EXERCISE_TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <p className="text-xs leading-relaxed">{ex.instructions}</p>

                  <div className="pt-2 border-t st-border text-xs space-y-2">
                    <div>
                      <span className="font-semibold">Целевые мышцы: </span>
                      <span className="st-muted">
                        {ex.targetMuscles.join(' · ')}
                      </span>
                    </div>

                    {/* 5x3 Таблица по углам конечности */}
                    <div className="space-y-1">
                      <div className="font-semibold text-[11px]">
                        Углы конечности:
                      </div>
                      <div className="overflow-hidden rounded-lg border st-border">
                        <table className="w-full text-[11px] border-collapse">
                          <thead>
                            <tr className="st-surface-muted border-b st-border text-left">
                              <th className="px-2.5 py-1 font-semibold">Конечность</th>
                              <th className="px-2.5 py-1 font-semibold text-center">Стойка</th>
                              <th className="px-2.5 py-1 font-semibold text-center">Угол</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y st-border">
                            {LIMB_ROWS.map((row) => {
                              const cell = limbMatrix[row.key];
                              return (
                                <tr key={row.key}>
                                  <td className="px-2.5 py-1 font-medium">
                                    {row.label}
                                  </td>
                                  <td className="px-2.5 py-1 text-center font-mono tabular-nums">
                                    {cell.stand}
                                  </td>
                                  <td className="px-2.5 py-1 text-center font-mono tabular-nums">
                                    {cell.angle}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg st-surface-muted border st-border text-xs flex items-start gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      <strong>ТБ:</strong> {ex.safetyNotes}
                    </span>
                  </div>

                  {/* Edit, Visibility Control ("Публичное" / "Скрытое") + Owner-only Delete */}
                  {!readOnly && (
                    <div className="pt-2 border-t st-border space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {canToggle ? (
                          <div
                            className="inline-flex items-center gap-1 p-1 rounded-lg st-surface-muted border st-border"
                            role="group"
                            aria-label="Видимость упражнения"
                          >
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSetVisibility(ex, 'public')}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                                vis === 'public'
                                  ? 'st-accent-bg'
                                  : 'st-muted hover:opacity-90'
                              }`}
                            >
                              <Globe className="w-3 h-3" />
                              <span>Публичное</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSetVisibility(ex, 'hidden')}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                                vis === 'hidden'
                                  ? 'st-accent-bg'
                                  : 'st-muted hover:opacity-90'
                              }`}
                            >
                              <EyeOff className="w-3 h-3" />
                              <span>Скрытое</span>
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] st-muted">
                            <Globe className="w-3 h-3" />
                            <span>Публичное (видят все студии)</span>
                          </span>
                        )}

                        <div className="flex items-center gap-1.5">
                          {canToggle && (
                            <button
                              type="button"
                              onClick={() => openEditExercise(ex)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border st-surface text-[11px] font-medium hover:opacity-90 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Изменить</span>
                            </button>
                          )}

                          {isOwner && (
                            <div className="flex items-center gap-1">
                              {isConfirmingDelete ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => handleDeleteExercise(ex.id)}
                                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    Подтвердить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 rounded-lg border st-border text-[11px] st-muted cursor-pointer"
                                  >
                                    Отмена
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(ex.id)}
                                  title="Удалить упражнение (только владелец)"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border st-border text-[11px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Удалить</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-[11px] st-muted">
                        {vis === 'public'
                          ? 'Публичное: доступно всем тренерам и студиям сети.'
                          : 'Скрытое: видят только владелец, администратор и тренер-автор.'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredExercises.length === 0 && (
          <div className="p-8 rounded-xl st-surface border st-border text-center text-xs st-muted">
            По выбранным параметрам упражнения не найдены.
          </div>
        )}
      </div>

      {/* Modal: Add Exercise */}
      {showAddEx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateExercise}
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl my-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold">
                Добавить упражнение в базу
              </h3>
              <button
                type="button"
                onClick={() => setShowAddEx(false)}
                className="p-1.5 rounded-lg border st-border st-muted hover:opacity-80 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Название упражнения
              </label>
              <input
                type="text"
                required
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Категория</label>
                <select
                  value={exCat}
                  onChange={(e) =>
                    setExCat(e.target.value as Exercise['category'])
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  <option value="Базовое вытяжение">Базовое вытяжение</option>
                  <option value="Ротация">Ротация</option>
                  <option value="Грудной отдел">Грудной отдел</option>
                  <option value="Силовое удержание">Силовое удержание</option>
                  <option value="Восстановление">Восстановление</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Тип упражнения</label>
                <select
                  value={exType}
                  onChange={(e) => setExType(e.target.value as ExerciseType)}
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  {EXERCISE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Длительность (сек)
                </label>
                <input
                  type="number"
                  min={15}
                  value={exDuration}
                  onChange={(e) => setExDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Тяга (% веса)
                </label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={exLoadPct}
                  onChange={(e) => setExLoadPct(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                />
              </div>
            </div>

            <DifficultyStarPicker
              value={exDifficulty}
              onChange={setExDifficulty}
            />

            <div>
              <label className="block text-xs font-medium mb-1">
                Видимость упражнения в базе
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExVisibility('public')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                    exVisibility === 'public'
                      ? 'st-accent-bg border-transparent'
                      : 'st-border st-surface st-muted'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Публичное (всем студиям)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExVisibility('hidden')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                    exVisibility === 'hidden'
                      ? 'st-accent-bg border-transparent'
                      : 'st-border st-surface st-muted'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Скрытое (владелец, админ, автор)</span>
                </button>
              </div>
            </div>

            {/* Photo selection + upload + preview */}
            <div className="p-3 rounded-lg st-surface-muted border st-border space-y-2.5">
              <div className="text-xs font-medium">Фотография упражнения</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border st-border">
                  <img
                    src={exImage}
                    alt="Предпросмотр"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <div>
                    <label className="block text-[11px] st-muted mb-1">
                      Пресет студии
                    </label>
                    <select
                      value={
                        PRESET_PHOTOS.some((p) => p.url === exImage)
                          ? exImage
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) setExImage(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border st-border st-surface"
                    >
                      {!PRESET_PHOTOS.some((p) => p.url === exImage) && (
                        <option value="">Загруженное / пользовательское фото</option>
                      )}
                      {PRESET_PHOTOS.map((p) => (
                        <option key={p.url} value={p.url}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer hover:opacity-90">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Загрузить своё фото</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e, setExImage)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <LimbAngleMatrixEditor
              matrix={exLimbMatrix}
              onChange={setExLimbMatrix}
            />

            <div>
              <label className="block text-xs font-medium mb-1">
                Инструкция по технике выполнения
              </label>
              <textarea
                rows={3}
                required
                value={exInstructions}
                onChange={(e) => setExInstructions(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Целевые группы мышц (через запятую)
              </label>
              <input
                type="text"
                value={exMuscles}
                onChange={(e) => setExMuscles(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Техника безопасности
              </label>
              <textarea
                rows={2}
                required
                value={exSafety}
                onChange={(e) => setExSafety(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddEx(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={addSaving}
                className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer disabled:opacity-60"
              >
                {addSaving ? 'Сохранение...' : 'Сохранить упражнение'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Exercise */}
      {editingEx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEditedExercise}
            className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl st-surface border st-border p-6 space-y-4 shadow-xl my-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold">
                Редактировать упражнение
              </h3>
              <button
                type="button"
                onClick={() => setEditingEx(null)}
                className="p-1.5 rounded-lg border st-border st-muted hover:opacity-80 cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {editError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1">
                Название упражнения
              </label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Категория</label>
                <select
                  value={editCat}
                  onChange={(e) =>
                    setEditCat(e.target.value as Exercise['category'])
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  <option value="Базовое вытяжение">Базовое вытяжение</option>
                  <option value="Ротация">Ротация</option>
                  <option value="Грудной отдел">Грудной отдел</option>
                  <option value="Силовое удержание">Силовое удержание</option>
                  <option value="Восстановление">Восстановление</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Тип упражнения</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as ExerciseType)}
                  className="w-full px-3 py-2 text-xs rounded-lg border st-border st-surface"
                >
                  {EXERCISE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Длительность (сек)
                </label>
                <input
                  type="number"
                  min={15}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Тяга (% веса)
                </label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={editLoadPct}
                  onChange={(e) => setEditLoadPct(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border st-border st-surface"
                />
              </div>
            </div>

            <DifficultyStarPicker
              value={editDifficulty}
              onChange={setEditDifficulty}
            />

            <div>
              <label className="block text-xs font-medium mb-1">
                Видимость упражнения в базе
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditVisibility('public')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                    editVisibility === 'public'
                      ? 'st-accent-bg border-transparent'
                      : 'st-border st-surface st-muted'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Публичное (всем студиям)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditVisibility('hidden')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium cursor-pointer ${
                    editVisibility === 'hidden'
                      ? 'st-accent-bg border-transparent'
                      : 'st-border st-surface st-muted'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Скрытое (владелец, админ, автор)</span>
                </button>
              </div>
            </div>

            {/* Photo preview + replace / preset */}
            <div className="p-3 rounded-lg st-surface-muted border st-border space-y-2.5">
              <div className="text-xs font-medium">Фотография упражнения</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border st-border">
                  <img
                    src={editImage}
                    alt={editTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <div>
                    <label className="block text-[11px] st-muted mb-1">
                      Выбрать из пресетов студии
                    </label>
                    <select
                      value={
                        PRESET_PHOTOS.some((p) => p.url === editImage)
                          ? editImage
                          : ''
                      }
                      onChange={(e) => {
                        if (e.target.value) setEditImage(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border st-border st-surface"
                    >
                      {!PRESET_PHOTOS.some((p) => p.url === editImage) && (
                        <option value="">Текущее / загруженное фото</option>
                      )}
                      {PRESET_PHOTOS.map((p) => (
                        <option key={p.url} value={p.url}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border st-border st-surface text-xs font-medium cursor-pointer hover:opacity-90">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Изменить / загрузить фото</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoUpload(e, setEditImage)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <LimbAngleMatrixEditor
              matrix={editLimbMatrix}
              onChange={setEditLimbMatrix}
            />

            <div>
              <label className="block text-xs font-medium mb-1">
                Инструкция по технике выполнения
              </label>
              <textarea
                rows={3}
                required
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Целевые группы мышц (через запятую)
              </label>
              <input
                type="text"
                value={editMuscles}
                onChange={(e) => setEditMuscles(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Техника безопасности
              </label>
              <textarea
                rows={2}
                required
                value={editSafety}
                onChange={(e) => setEditSafety(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingEx(null)}
                className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg cursor-pointer disabled:opacity-60"
              >
                {editSaving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Create / Edit Complex Workout Program */}
      {showCreateProgram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
          onClick={closeProgramModal}
        >
          <form
            onSubmit={handleSaveProgram}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] rounded-xl st-surface border st-border shadow-xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b st-border shrink-0">
              <div>
                <h3 className="font-display text-lg font-semibold">
                  {editingProgramId
                    ? 'Редактировать комплексную тренировку'
                    : 'Создать комплексную тренировку'}
                </h3>
                <p className="text-xs st-muted mt-0.5">
                  Настройте название, клиента, задачи и порядок упражнений в сессии
                </p>
              </div>
              <button
                type="button"
                onClick={closeProgramModal}
                aria-label="Закрыть окно"
                className="p-1.5 rounded-lg border st-border hover:opacity-80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {progError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {progError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-1">
                  Название комплекса
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Третья тренировка · Укрепление кора"
                  value={progTitle}
                  onChange={(e) => setProgTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Этап / уровень
                  </label>
                  <select
                    value={progLevel}
                    onChange={(e) =>
                      setProgLevel(e.target.value as WorkoutProgram['level'])
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
                  >
                    <option value="Первая тренировка">Первая тренировка</option>
                    <option value="Вторая тренировка">Вторая тренировка</option>
                    <option value="Продвинутая">Продвинутая</option>
                    <option value="Индивидуальная">Индивидуальная</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Назначить клиенту (опционально)
                  </label>
                  <select
                    value={progClientId}
                    onChange={(e) => setProgClientId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
                  >
                    <option value="">Общая методика (для всех)</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Описание задач комплекса
                </label>
                <textarea
                  rows={2}
                  value={progDesc}
                  onChange={(e) => setProgDesc(e.target.value)}
                  placeholder="Ключевые цели, показания и особенности проведения комплекса..."
                  className="w-full px-3 py-2 text-sm rounded-lg border st-border st-surface"
                />
              </div>

              {/* Selected sequence with reorder & live program difficulty summary */}
              {(() => {
                const selectedExList = progExerciseIds
                  .map((eid) => exercises.find((item) => item.id === eid))
                  .filter((ex): ex is Exercise => Boolean(ex));
                const liveDiff = computeProgramDifficulty(selectedExList);
                const liveMinutes = Math.max(
                  0,
                  Math.round(
                    selectedExList.reduce((acc, ex) => acc + ex.defaultDurationSec, 0) / 60
                  )
                );
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="block text-xs font-medium">
                          Упражнения в программе ({progExerciseIds.length})
                        </label>
                        {selectedExList.length > 0 && (
                          <span className="inline-flex items-center gap-2 px-2 py-0.5 rounded-md st-surface-muted border st-border">
                            <DifficultyStars
                              value={liveDiff.avg}
                              size="xs"
                              showNumeric
                              showLabel
                            />
                            <span className="text-[10px] font-mono st-muted tabular-nums">
                              ~{liveMinutes} мин
                            </span>
                          </span>
                        )}
                      </div>
                      {progExerciseIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setProgExerciseIds([])}
                          className="text-[11px] st-muted hover:text-rose-500 cursor-pointer"
                        >
                          Очистить список
                        </button>
                      )}
                    </div>
                    {progExerciseIds.length === 0 ? (
                      <div className="p-3 rounded-lg border border-dashed st-border text-xs st-muted text-center">
                        Выберите упражнения из каталога ниже — для каждого показана сложность (1–5★)
                      </div>
                    ) : (
                      <div className="space-y-1.5 border st-border rounded-lg p-2 st-surface-muted max-h-44 overflow-y-auto">
                        {progExerciseIds.map((eid, idx) => {
                          const ex = exercises.find((item) => item.id === eid);
                          const diffVal = ex ? inferExerciseDifficulty(ex) : 3;
                          return (
                            <div
                              key={`${eid}-${idx}`}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg st-surface border st-border text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-[11px] st-accent-text font-semibold shrink-0">
                                  {idx + 1}.
                                </span>
                                <span className="font-medium truncate">
                                  {ex ? ex.title : `Упражнение (${eid})`}
                                </span>
                                {ex && (
                                  <DifficultyStars
                                    value={diffVal}
                                    size="xs"
                                    className="shrink-0"
                                  />
                                )}
                                {ex && (
                                  <span className="hidden sm:inline text-[11px] st-muted shrink-0 font-mono">
                                    · {ex.defaultDurationSec}с
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => moveProgExercise(idx, -1)}
                                  disabled={idx === 0}
                                  title="Переместить выше"
                                  className="p-1 rounded border st-border disabled:opacity-30 hover:opacity-80 cursor-pointer"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveProgExercise(idx, 1)}
                                  disabled={idx === progExerciseIds.length - 1}
                                  title="Переместить ниже"
                                  className="p-1 rounded border st-border disabled:opacity-30 hover:opacity-80 cursor-pointer"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleProgExercise(eid)}
                                  title="Убрать из программы"
                                  className="p-1 rounded border st-border text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Searchable exercise picker with difficulty filter & 1-5 stars */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-medium">
                    Выбор упражнений из каталога
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="flex items-center gap-0.5 p-0.5 rounded-lg st-surface-muted border st-border text-[11px]">
                      {(
                        [
                          ['all', 'Все ★'],
                          ['easy', '1–2 ★'],
                          ['medium', '3 ★'],
                          ['hard', '4–5 ★'],
                        ] as const
                      ).map(([dk, dl]) => (
                        <button
                          key={dk}
                          type="button"
                          onClick={() => setProgDiffFilter(dk)}
                          className={`px-2 py-0.5 rounded cursor-pointer ${
                            progDiffFilter === dk
                              ? 'st-surface font-semibold shadow-sm'
                              : 'st-muted hover:opacity-80'
                          }`}
                        >
                          {dl}
                        </button>
                      ))}
                    </div>
                    <input
                      type="search"
                      value={progExSearch}
                      onChange={(e) => setProgExSearch(e.target.value)}
                      placeholder="Поиск..."
                      className="px-2.5 py-1 text-xs rounded-lg border st-border st-surface min-w-[140px]"
                    />
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1 border st-border rounded-lg p-2">
                  {exercises
                    .filter((ex) => {
                      const diff = inferExerciseDifficulty(ex);
                      const diffOk =
                        progDiffFilter === 'all' ||
                        (progDiffFilter === 'easy' && diff <= 2) ||
                        (progDiffFilter === 'medium' && diff === 3) ||
                        (progDiffFilter === 'hard' && diff >= 4);
                      if (!diffOk) return false;
                      const q = progExSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        ex.title.toLowerCase().includes(q) ||
                        ex.category.toLowerCase().includes(q)
                      );
                    })
                    .map((ex) => {
                      const checked = progExerciseIds.includes(ex.id);
                      const orderNum = checked ? progExerciseIds.indexOf(ex.id) + 1 : null;
                      const diff = inferExerciseDifficulty(ex);
                      return (
                        <label
                          key={ex.id}
                          className={`flex items-center justify-between gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                            checked
                              ? 'st-surface-muted border st-border font-medium'
                              : 'hover:st-surface-muted'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProgExercise(ex.id)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{ex.title}</div>
                              <div className="text-[10px] st-muted truncate">
                                {ex.category} · {ex.defaultDurationSec}с · Тяга {ex.recommendedLoadPct}%
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <DifficultyStars value={diff} size="xs" showNumeric />
                            {orderNum !== null && (
                              <span className="px-1.5 py-0.5 rounded st-accent-bg text-[10px] font-mono tabular-nums">
                                #{orderNum}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t st-border st-surface shrink-0">
              <button
                type="button"
                onClick={closeProgramModal}
                disabled={progSaving}
                className="px-4 py-2 text-xs font-medium rounded-lg border st-border cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={progSaving}
                className="px-4 py-2 text-xs font-medium rounded-lg st-accent-bg disabled:opacity-50 cursor-pointer"
              >
                {progSaving
                  ? 'Сохранение...'
                  : editingProgramId
                  ? 'Сохранить изменения'
                  : 'Сохранить комплекс'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
