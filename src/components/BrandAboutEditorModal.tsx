import React, { useEffect, useState } from 'react';
import { Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import type {
  BrandAboutInfo,
  BrandApproachCard,
  MethodologyProgramBlock,
  ServiceCategory,
} from '../types';
import { apiRequest } from '../utils/api';
import { DEFAULT_METHODOLOGY_BLOCKS } from '../utils/brandAbout';
import { SERVICE_CATEGORY_OPTIONS } from '../utils/serviceCategories';
import { STUDIO_PHOTO_PRESETS, compressStudioPhoto } from '../utils/reviews';

interface BrandAboutEditorModalProps {
  initialBrandAbout: BrandAboutInfo;
  initialTab?: 'general' | 'blocks';
  onSaved: (updated: BrandAboutInfo) => void;
  onClose: () => void;
}

const TONE_OPTIONS: { value: NonNullable<MethodologyProgramBlock['accentTone']>; label: string }[] = [
  { value: 'cyan', label: 'Бирюзовый (Спорт)' },
  { value: 'violet', label: 'Индиго (Офис / Релакс)' },
  { value: 'emerald', label: 'Изумрудный (Возраст 50+)' },
  { value: 'amber', label: 'Янтарный (Дети)' },
  { value: 'rose', label: 'Розовый (Мамочки)' },
];

export const BrandAboutEditorModal: React.FC<BrandAboutEditorModalProps> = ({
  initialBrandAbout,
  initialTab = 'general',
  onSaved,
  onClose,
}) => {
  const [editorTab, setEditorTab] = useState<'general' | 'blocks'>(initialTab);

  const [brandName, setBrandName] = useState(initialBrandAbout.brandName || '');
  const [tagline, setTagline] = useState(initialBrandAbout.tagline || '');
  const [aboutNetwork, setAboutNetwork] = useState(initialBrandAbout.aboutNetwork || '');
  const [methodologyTitle, setMethodologyTitle] = useState(
    initialBrandAbout.methodologyTitle || ''
  );
  const [methodologyDescription, setMethodologyDescription] = useState(
    initialBrandAbout.methodologyDescription || ''
  );
  const [whyUsTitle, setWhyUsTitle] = useState(initialBrandAbout.whyUsTitle || '');
  const [whyUsPointsText, setWhyUsPointsText] = useState(
    (initialBrandAbout.whyUsPoints || []).join('\n')
  );
  const [approaches, setApproaches] = useState<BrandApproachCard[]>(
    initialBrandAbout.approaches || []
  );
  const [methodologyBlocks, setMethodologyBlocks] = useState<MethodologyProgramBlock[]>(() =>
    initialBrandAbout.methodologyBlocks && initialBrandAbout.methodologyBlocks.length > 0
      ? initialBrandAbout.methodologyBlocks
      : DEFAULT_METHODOLOGY_BLOCKS
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    () =>
      (initialBrandAbout.methodologyBlocks && initialBrandAbout.methodologyBlocks[0]?.id) ||
      DEFAULT_METHODOLOGY_BLOCKS[0]?.id ||
      ''
  );
  const [equipmentAndSafety, setEquipmentAndSafety] = useState(
    initialBrandAbout.equipmentAndSafety || ''
  );
  const [networkPhone, setNetworkPhone] = useState(initialBrandAbout.networkPhone || '');
  const [networkEmail, setNetworkEmail] = useState(initialBrandAbout.networkEmail || '');
  const [website, setWebsite] = useState(initialBrandAbout.socials?.website || '');
  const [telegram, setTelegram] = useState(initialBrandAbout.socials?.telegram || '');
  const [vk, setVk] = useState(initialBrandAbout.socials?.vk || '');
  const [whatsapp, setWhatsapp] = useState(initialBrandAbout.socials?.whatsapp || '');
  const [instagram, setInstagram] = useState(initialBrandAbout.socials?.instagram || '');
  const [youtube, setYoutube] = useState(initialBrandAbout.socials?.youtube || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const activeBlock =
    methodologyBlocks.find((b) => b.id === selectedBlockId) || methodologyBlocks[0];

  const updateActiveBlock = (patch: Partial<MethodologyProgramBlock>) => {
    if (!activeBlock) return;
    setMethodologyBlocks((prev) =>
      prev.map((b) => (b.id === activeBlock.id ? { ...b, ...patch } : b))
    );
  };

  const handleAddMethodologyBlock = () => {
    const newId = `mb-custom-${Date.now()}`;
    const nextBlock: MethodologyProgramBlock = {
      id: newId,
      slug: 'custom',
      badge: 'Новое направление',
      title: 'Новое направление ZA ПравИло',
      subtitle: 'Описание аудитории и задач тренировки',
      quoteOrMotto: 'Возьми за правило заниматься на ПравИло!',
      promoBadge: 'Первое занятие',
      heroImageUrl: STUDIO_PHOTO_PRESETS[0]?.url || '',
      accentTone: 'cyan',
      recommendedServiceCategory: 'wellness',
      recommendedServiceHint: 'Оздоровительное вытяжение',
      summary: 'Подробное описание программы для изучения клиентами.',
      reasonsTitle: 'Причины выбрать это направление',
      reasons: ['Снятие напряжения в спине и шее', 'Мягкое улучшение гибкости и осанки'],
      featureCards: [
        {
          id: `${newId}-c1`,
          heading: 'Бережный подход',
          text: 'Подбор стоек и углов индивидуально под уровень подготовки.',
        },
      ],
      contraindicationsNote: 'Перед стартом проводится замер давления и пульса.',
      active: true,
    };
    setMethodologyBlocks((prev) => [...prev, nextBlock]);
    setSelectedBlockId(newId);
  };

  const handleDeleteActiveBlock = () => {
    if (!activeBlock || methodologyBlocks.length <= 1) return;
    const next = methodologyBlocks.filter((b) => b.id !== activeBlock.id);
    setMethodologyBlocks(next);
    setSelectedBlockId(next[0]?.id || '');
  };

  const handleHeroFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeBlock) return;
    setError('');
    try {
      const compressed = await compressStudioPhoto(file);
      updateActiveBlock({ heroImageUrl: compressed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить изображение');
    }
  };

  const handleAddApproach = () => {
    setApproaches((prev) => [
      ...prev,
      {
        id: `app-${Date.now()}`,
        title: `${prev.length + 1}. Новый подход в работе`,
        description: '',
      },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const whyUsPoints = whyUsPointsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const updated = await apiRequest<BrandAboutInfo>('/api/brand-about', {
        method: 'PUT',
        body: JSON.stringify({
          brandName,
          tagline,
          aboutNetwork,
          methodologyTitle,
          methodologyDescription,
          whyUsTitle,
          whyUsPoints,
          approaches,
          methodologyBlocks,
          equipmentAndSafety,
          networkPhone,
          networkEmail,
          socials: {
            website,
            telegram,
            vk,
            whatsapp,
            instagram,
            youtube,
          },
        }),
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить информацию о сети');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-2 sm:p-4 overflow-hidden"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col rounded-xl st-surface border st-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6 sm:py-4 border-b st-border">
          <div className="min-w-0">
            <h3 className="font-display text-base sm:text-lg font-semibold truncate">
              Редактирование информации о сети, методиках и контактах
            </h3>
            <p className="text-xs st-muted truncate">
              Отображается клиентам в мобильном кабинете (PWA) и на странице онлайн-записи
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border text-xs font-medium hover:opacity-80 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Закрыть</span>
          </button>
        </div>

        {/* Sticky Sub-Tabs */}
        <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b st-border st-surface-muted flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditorTab('general')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              editorTab === 'general' ? 'st-accent-bg' : 'st-surface border st-border st-muted'
            }`}
          >
            Сеть, контакты и общая методика
          </button>
          <button
            type="button"
            onClick={() => setEditorTab('blocks')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              editorTab === 'blocks' ? 'st-accent-bg' : 'st-surface border st-border st-muted'
            }`}
          >
            Блоки методик (Спорт, Офис, Возраст, Дети, Мамочки — {methodologyBlocks.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {editorTab === 'general' && (
            <>
              {/* Network Identity & Contacts */}
              <div className="p-4 rounded-xl st-surface-muted border st-border space-y-3">
                <div className="font-semibold text-sm">Сеть, единые контакты, сайт и соцсети</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block st-muted mb-1">Название сети / бренда</label>
                    <input
                      type="text"
                      required
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">Слоган / подзаголовок</label>
                    <input
                      type="text"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">Единый телефон сети</label>
                    <input
                      type="text"
                      value={networkPhone}
                      onChange={(e) => setNetworkPhone(e.target.value)}
                      placeholder="+7 (495) 120-88-00"
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface font-mono"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">E-mail сети</label>
                    <input
                      type="email"
                      value={networkEmail}
                      onChange={(e) => setNetworkEmail(e.target.value)}
                      placeholder="care@etalon-pravilo.ru"
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>

                <div>
                  <label className="block st-muted mb-1">О сети студий (вводный текст)</label>
                  <textarea
                    rows={3}
                    value={aboutNetwork}
                    onChange={(e) => setAboutNetwork(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="block st-muted mb-1">Официальный сайт</label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://etalon-pravilo.ru"
                      className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">Telegram</label>
                    <input
                      type="text"
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder="@etalon_pravilo или https://t.me/..."
                      className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">ВКонтакте</label>
                    <input
                      type="text"
                      value={vk}
                      onChange={(e) => setVk(e.target.value)}
                      placeholder="https://vk.com/..."
                      className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">WhatsApp</label>
                    <input
                      type="text"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+79990000000 или ссылка"
                      className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">Instagram</label>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="@etalon_pravilo или ссылка"
                      className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
                    />
                  </div>
                  <div>
                    <label className="block st-muted mb-1">YouTube</label>
                    <input
                      type="text"
                      value={youtube}
                      onChange={(e) => setYoutube(e.target.value)}
                      placeholder="https://youtube.com/@..."
                      className="w-full px-2.5 py-1.5 rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>
              </div>

              {/* Methodology */}
              <div className="p-4 rounded-xl st-surface-muted border st-border space-y-3">
                <div className="font-semibold text-sm">Методика в целом и безопасность</div>
                <div>
                  <label className="block st-muted mb-1">Заголовок блока о методике</label>
                  <input
                    type="text"
                    value={methodologyTitle}
                    onChange={(e) => setMethodologyTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block st-muted mb-1">Подробно о методике (как это работает)</label>
                  <textarea
                    rows={4}
                    value={methodologyDescription}
                    onChange={(e) => setMethodologyDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block st-muted mb-1">Оборудование и протокол безопасности</label>
                  <textarea
                    rows={3}
                    value={equipmentAndSafety}
                    onChange={(e) => setEquipmentAndSafety(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              {/* Why Us */}
              <div className="p-4 rounded-xl st-surface-muted border st-border space-y-3">
                <div className="font-semibold text-sm">Блок «Почему мы»</div>
                <div>
                  <label className="block st-muted mb-1">Заголовок</label>
                  <input
                    type="text"
                    value={whyUsTitle}
                    onChange={(e) => setWhyUsTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
                <div>
                  <label className="block st-muted mb-1">
                    Преимущества (каждый пункт с новой строки)
                  </label>
                  <textarea
                    rows={5}
                    value={whyUsPointsText}
                    onChange={(e) => setWhyUsPointsText(e.target.value)}
                    placeholder="Каждый пункт на отдельной строке..."
                    className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                  />
                </div>
              </div>

              {/* Approaches */}
              <div className="p-4 rounded-xl st-surface-muted border st-border space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm">
                      Подходы в работе («Чем и как мы работаем»)
                    </div>
                    <div className="text-[11px] st-muted">
                      Пошаговые принципы и технологии работы с клиентами
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddApproach}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg st-accent-bg font-medium cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Добавить карточку</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {approaches.map((card, idx) => (
                    <div
                      key={card.id}
                      className="p-3 rounded-lg st-surface border st-border space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={card.title}
                          onChange={(e) =>
                            setApproaches((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, title: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Заголовок подхода"
                          className="flex-1 px-2.5 py-1.5 rounded border st-border st-surface font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setApproaches((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Удалить подход"
                          className="p-1.5 rounded border st-border text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={card.description}
                        onChange={(e) =>
                          setApproaches((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, description: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Описание подхода или используемого оборудования..."
                        className="w-full px-2.5 py-1.5 rounded border st-border st-surface"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {editorTab === 'blocks' && (
            <div className="space-y-4">
              {/* Block Switcher + Add/Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {methodologyBlocks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBlockId(b.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        activeBlock?.id === b.id
                          ? 'st-accent-bg border-transparent'
                          : 'st-surface st-border st-muted'
                      } ${b.active === false ? 'opacity-50 line-through' : ''}`}
                    >
                      {b.title || b.badge}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMethodologyBlocks(DEFAULT_METHODOLOGY_BLOCKS);
                      setSelectedBlockId(DEFAULT_METHODOLOGY_BLOCKS[0]?.id || '');
                    }}
                    title="Восстановить все 5 стандартных блоков"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border st-border st-surface font-medium cursor-pointer hover:opacity-85"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Стандартные 5</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMethodologyBlock}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg st-accent-bg font-medium cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Новый блок</span>
                  </button>
                </div>
              </div>

              {activeBlock && (
                <div className="p-4 rounded-xl st-surface-muted border st-border space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b st-border">
                    <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeBlock.active !== false}
                        onChange={(e) => updateActiveBlock({ active: e.target.checked })}
                      />
                      <span>Показывать блок клиентам</span>
                    </label>
                    {methodologyBlocks.length > 1 && (
                      <button
                        type="button"
                        onClick={handleDeleteActiveBlock}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 font-medium cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Удалить блок</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block st-muted mb-1">Название блока</label>
                      <input
                        type="text"
                        value={activeBlock.title}
                        onChange={(e) => updateActiveBlock({ title: e.target.value })}
                        placeholder="Например: Возраст ZA ПравИло"
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block st-muted mb-1">Короткий тег (бейдж)</label>
                      <input
                        type="text"
                        value={activeBlock.badge}
                        onChange={(e) => updateActiveBlock({ badge: e.target.value })}
                        placeholder="Возраст 50+ / Дети / Мамочки"
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      />
                    </div>
                    <div>
                      <label className="block st-muted mb-1">Цветовой акцент</label>
                      <select
                        value={activeBlock.accentTone || 'cyan'}
                        onChange={(e) =>
                          updateActiveBlock({
                            accentTone: e.target.value as MethodologyProgramBlock['accentTone'],
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      >
                        {TONE_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block st-muted mb-1">Подзаголовок презентации</label>
                    <input
                      type="text"
                      value={activeBlock.subtitle}
                      onChange={(e) => updateActiveBlock({ subtitle: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block st-muted mb-1">Девиз / цитата</label>
                      <input
                        type="text"
                        value={activeBlock.quoteOrMotto || ''}
                        onChange={(e) => updateActiveBlock({ quoteOrMotto: e.target.value })}
                        placeholder="Возьми за правило заниматься на ПравИло!"
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      />
                    </div>
                    <div>
                      <label className="block st-muted mb-1">Акционная плашка (опционально)</label>
                      <input
                        type="text"
                        value={activeBlock.promoBadge || ''}
                        onChange={(e) => updateActiveBlock({ promoBadge: e.target.value })}
                        placeholder="Запись на первое занятие со скидкой 50%"
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block st-muted mb-1">
                        Направление записи при выборе этого блока
                      </label>
                      <select
                        value={activeBlock.recommendedServiceCategory || ''}
                        onChange={(e) =>
                          updateActiveBlock({
                            recommendedServiceCategory: (e.target.value || undefined) as
                              | ServiceCategory
                              | undefined,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      >
                        <option value="">Все направления</option>
                        {SERVICE_CATEGORY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block st-muted mb-1">Подсказка по программе записи</label>
                      <input
                        type="text"
                        value={activeBlock.recommendedServiceHint || ''}
                        onChange={(e) =>
                          updateActiveBlock({ recommendedServiceHint: e.target.value })
                        }
                        placeholder="Например: Детская коррекция осанки и баланс-бревно"
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      />
                    </div>
                  </div>

                  {/* Hero Image Picker */}
                  <div className="p-3 rounded-lg st-surface border st-border space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Изображение презентации</span>
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border st-border st-surface-muted font-medium cursor-pointer hover:opacity-85">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Загрузить с устройства</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleHeroFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={
                          STUDIO_PHOTO_PRESETS.some((p) => p.url === activeBlock.heroImageUrl)
                            ? activeBlock.heroImageUrl
                            : ''
                        }
                        onChange={(e) => {
                          if (e.target.value) updateActiveBlock({ heroImageUrl: e.target.value });
                        }}
                        className="px-2.5 py-1.5 rounded-lg border st-border st-surface"
                      >
                        <option value="">Выбрать готовое фото студии...</option>
                        {STUDIO_PHOTO_PRESETS.map((p) => (
                          <option key={p.url} value={p.url}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={activeBlock.heroImageUrl || ''}
                        onChange={(e) => updateActiveBlock({ heroImageUrl: e.target.value })}
                        placeholder="URL изображения (https://... или /src/assets/...)"
                        className="px-2.5 py-1.5 rounded-lg border st-border st-surface"
                      />
                    </div>
                    {activeBlock.heroImageUrl && (
                      <div className="flex items-center gap-3 pt-1">
                        <img
                          src={activeBlock.heroImageUrl}
                          alt={activeBlock.title}
                          className="w-24 h-14 object-cover rounded border st-border"
                        />
                        <button
                          type="button"
                          onClick={() => updateActiveBlock({ heroImageUrl: '' })}
                          className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Убрать изображение
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block st-muted mb-1">Основное описание методики</label>
                    <textarea
                      rows={3}
                      value={activeBlock.summary}
                      onChange={(e) => updateActiveBlock({ summary: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block st-muted mb-1">Заголовок списка преимуществ</label>
                      <input
                        type="text"
                        value={activeBlock.reasonsTitle || ''}
                        onChange={(e) => updateActiveBlock({ reasonsTitle: e.target.value })}
                        placeholder="Например: 10 причин для занятий"
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface mb-2"
                      />
                      <label className="block st-muted mb-1">
                        Причины / эффекты (каждый пункт с новой строки)
                      </label>
                      <textarea
                        rows={6}
                        value={(activeBlock.reasons || []).join('\n')}
                        onChange={(e) =>
                          updateActiveBlock({
                            reasons: e.target.value
                              .split('\n')
                              .map((l) => l.trim())
                              .filter(Boolean),
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          Карточки акцентов ({activeBlock.featureCards.length})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveBlock({
                              featureCards: [
                                ...activeBlock.featureCards,
                                {
                                  id: `${activeBlock.id}-card-${Date.now()}`,
                                  heading: 'Новый акцент',
                                  text: '',
                                },
                              ],
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded st-accent-bg text-[11px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Карточка</span>
                        </button>
                      </div>

                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {activeBlock.featureCards.map((card, cIdx) => (
                          <div
                            key={card.id}
                            className="p-2.5 rounded-lg st-surface border st-border space-y-1.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={card.heading}
                                onChange={(e) =>
                                  updateActiveBlock({
                                    featureCards: activeBlock.featureCards.map((it, i) =>
                                      i === cIdx ? { ...it, heading: e.target.value } : it
                                    ),
                                  })
                                }
                                placeholder="Заголовок (например: Жизнь без боли)"
                                className="flex-1 px-2 py-1 rounded border st-border st-surface font-semibold"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateActiveBlock({
                                    featureCards: activeBlock.featureCards.filter(
                                      (_, i) => i !== cIdx
                                    ),
                                  })
                                }
                                className="p-1 rounded border st-border text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={card.text}
                              onChange={(e) =>
                                updateActiveBlock({
                                  featureCards: activeBlock.featureCards.map((it, i) =>
                                    i === cIdx ? { ...it, text: e.target.value } : it
                                  ),
                                })
                              }
                              placeholder="Текст карточки..."
                              className="w-full px-2 py-1 rounded border st-border st-surface"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block st-muted mb-1">
                      Примечание по подготовке и безопасности
                    </label>
                    <textarea
                      rows={2}
                      value={activeBlock.contraindicationsNote || ''}
                      onChange={(e) =>
                        updateActiveBlock({ contraindicationsNote: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border st-border st-surface"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex justify-end gap-2 px-4 py-3 sm:px-6 border-t st-border st-surface">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border st-border text-xs font-medium cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg st-accent-bg text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить информацию'}
          </button>
        </div>
      </form>
    </div>
  );
};
