/* @ds-bundle: {"format":3,"namespace":"KSECRMDesignSystem_a08b7d","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"Avatar","sourcePath":"components/data/Avatar.jsx"},{"name":"ClientCard","sourcePath":"components/data/ClientCard.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"FollowupBadge","sourcePath":"components/feedback/FollowupBadge.jsx"},{"name":"StageBadge","sourcePath":"components/feedback/StageBadge.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"969cc6540b1b","components/data/Avatar.jsx":"231a209d9b78","components/data/ClientCard.jsx":"febdedc60163","components/feedback/Badge.jsx":"05f12d382410","components/feedback/FollowupBadge.jsx":"1760ea5277c0","components/feedback/StageBadge.jsx":"606dad3fef1e","components/forms/Input.jsx":"b194e889dcc1"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.KSECRMDesignSystem_a08b7d = window.KSECRMDesignSystem_a08b7d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
/**
 * Primary action button for KSE CRM.
 * All sizes meet the 44px minimum touch target requirement (mobile-first).
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  onClick,
  type = 'button'
}) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const sizeMap = {
    sm: {
      height: '32px',
      padding: '0 12px',
      fontSize: 'var(--text-sm)',
      minWidth: '44px'
    },
    md: {
      height: '40px',
      padding: '0 16px',
      fontSize: 'var(--text-base)',
      minWidth: '44px'
    },
    lg: {
      height: '48px',
      padding: '0 20px',
      fontSize: 'var(--text-md)',
      minWidth: '44px'
    }
  };
  const variantMap = {
    primary: {
      base: {
        background: 'var(--interactive)',
        color: 'var(--text-on-brand)',
        border: '1px solid transparent'
      },
      hover: {
        background: 'var(--interactive-hover)'
      },
      active: {
        background: 'var(--interactive-active)'
      }
    },
    secondary: {
      base: {
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)'
      },
      hover: {
        background: 'var(--bg-surface-2)'
      },
      active: {
        background: 'var(--neutral-200)'
      }
    },
    ghost: {
      base: {
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid transparent'
      },
      hover: {
        background: 'var(--bg-surface-2)',
        color: 'var(--text-primary)'
      },
      active: {
        background: 'var(--neutral-200)',
        color: 'var(--text-primary)'
      }
    },
    danger: {
      base: {
        background: 'var(--error-500)',
        color: '#ffffff',
        border: '1px solid transparent'
      },
      hover: {
        background: 'var(--error-600)'
      },
      active: {
        background: 'var(--error-700)'
      }
    }
  };
  const v = variantMap[variant] || variantMap.primary;
  const stateOverride = disabled ? {} : pressed ? v.active : hovered ? v.hover : {};
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontFamily: 'var(--font-family)',
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background-color 120ms, border-color 120ms, color 120ms',
    whiteSpace: 'nowrap',
    outline: 'none',
    textDecoration: 'none',
    width: fullWidth ? '100%' : undefined,
    boxSizing: 'border-box',
    ...(sizeMap[size] || sizeMap.md),
    ...v.base,
    ...stateOverride
  };
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    disabled: disabled,
    style: style,
    onClick: disabled ? undefined : onClick,
    onMouseEnter: () => !disabled && setHovered(true),
    onMouseLeave: () => {
      setHovered(false);
      setPressed(false);
    },
    onMouseDown: () => !disabled && setPressed(true),
    onMouseUp: () => setPressed(false)
  }, icon && iconPosition === 'left' && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, icon), children, icon && iconPosition === 'right' && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, icon));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/data/Avatar.jsx
try { (() => {
/**
 * Circular avatar showing initials derived from a name.
 * Color is consistent per name — derived from the first character.
 */
function Avatar({
  name,
  src,
  size = 'md',
  onClick
}) {
  const [imgError, setImgError] = React.useState(false);
  const sizePx = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
    xl: 56
  };
  const px = sizePx[size] || sizePx.md;

  // Derive a consistent hue from the name for variety
  const hues = [48, 155, 250, 25, 200, 310, 80];
  const hue = name ? hues[name.charCodeAt(0) % hues.length] : 48;
  const initials = name ? name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';
  const showImage = src && !imgError;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      width: px,
      height: px,
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.round(px * 0.36) + 'px',
      fontWeight: 600,
      fontFamily: 'var(--font-family)',
      letterSpacing: '0.01em',
      backgroundColor: showImage ? 'transparent' : `oklch(0.87 0.080 ${hue})`,
      color: `oklch(0.30 0.090 ${hue})`,
      overflow: 'hidden',
      flexShrink: 0,
      userSelect: 'none',
      cursor: onClick ? 'pointer' : 'default'
    }
  }, showImage ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name || '',
    onError: () => setImgError(true),
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
/**
 * Generic status badge / pill.
 * For CRM-specific states, prefer StageBadge or FollowupBadge.
 */
function Badge({
  children,
  variant = 'neutral',
  size = 'md'
}) {
  const variantMap = {
    neutral: {
      bg: 'var(--neutral-100)',
      text: 'var(--neutral-700)',
      border: 'var(--neutral-200)'
    },
    brand: {
      bg: 'var(--brand-100)',
      text: 'var(--brand-700)',
      border: 'var(--brand-200)'
    },
    success: {
      bg: 'var(--success-100)',
      text: 'var(--success-700)',
      border: 'var(--success-200)'
    },
    error: {
      bg: 'var(--error-100)',
      text: 'var(--error-600)',
      border: 'var(--error-200)'
    },
    warning: {
      bg: 'var(--warning-100)',
      text: 'var(--warning-600)',
      border: 'var(--warning-100)'
    },
    info: {
      bg: 'var(--info-100)',
      text: 'var(--info-600)',
      border: 'var(--info-100)'
    }
  };
  const sizeMap = {
    sm: {
      padding: '2px 8px',
      fontSize: 'var(--text-xs)'
    },
    md: {
      padding: '5px 12px',
      fontSize: '12px'
    }
  };
  const v = variantMap[variant] || variantMap.neutral;
  const s = sizeMap[size] || sizeMap.md;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      borderRadius: 'var(--radius-full)',
      fontFamily: 'var(--font-family)',
      fontWeight: 600,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      border: `1px solid ${v.border}`,
      backgroundColor: v.bg,
      color: v.text,
      ...s
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/FollowupBadge.jsx
try { (() => {
/**
 * Follow-up state badge for KSE CRM.
 * Three states with intentional visual hierarchy — "late" in red for maximum visibility.
 */
function FollowupBadge({
  status
}) {
  const states = {
    late: {
      label: 'Atrasado',
      bg: 'var(--followup-late-bg)',
      text: 'var(--followup-late-text)',
      border: 'var(--followup-late-border)'
    },
    today: {
      label: 'Hoy',
      bg: 'var(--followup-today-bg)',
      text: 'var(--followup-today-text)',
      border: 'var(--followup-today-border)'
    },
    done: {
      label: 'Hecho',
      bg: 'var(--followup-done-bg)',
      text: 'var(--followup-done-text)',
      border: 'var(--followup-done-border)'
    }
  };
  const s = states[status] || states.today;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-full)',
      padding: '4px 10px',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      lineHeight: 1,
      fontFamily: 'var(--font-family)',
      whiteSpace: 'nowrap',
      backgroundColor: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`
    }
  }, s.label);
}
Object.assign(__ds_scope, { FollowupBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/FollowupBadge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StageBadge.jsx
try { (() => {
/**
 * Pipeline stage badge for KSE CRM.
 * Pass the stage number and the badge renders label + colors automatically.
 */
function StageBadge({
  stage
}) {
  const stages = {
    1: {
      label: 'Interesado',
      bg: 'var(--stage-1-bg)',
      text: 'var(--stage-1-text)',
      border: 'var(--stage-1-border)'
    },
    2: {
      label: 'En conversación',
      bg: 'var(--stage-2-bg)',
      text: 'var(--stage-2-text)',
      border: 'var(--stage-2-border)'
    },
    3: {
      label: 'Propuesta enviada',
      bg: 'var(--stage-3-bg)',
      text: 'var(--stage-3-text)',
      border: 'var(--stage-3-border)'
    },
    4: {
      label: 'Comprado ✓',
      bg: 'var(--stage-4-bg)',
      text: 'var(--stage-4-text)',
      border: 'var(--stage-4-border)'
    },
    5: {
      label: 'Perdido',
      bg: 'var(--stage-5-bg)',
      text: 'var(--stage-5-text)',
      border: 'var(--stage-5-border)'
    }
  };
  const s = stages[stage] || stages[1];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-full)',
      padding: '5px 12px',
      fontSize: '12px',
      fontWeight: 600,
      lineHeight: 1,
      fontFamily: 'var(--font-family)',
      whiteSpace: 'nowrap',
      backgroundColor: s.bg,
      color: s.text,
      border: `1px solid ${s.border}`
    }
  }, s.label);
}
Object.assign(__ds_scope, { StageBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StageBadge.jsx", error: String((e && e.message) || e) }); }

// components/data/ClientCard.jsx
try { (() => {
/**
 * Summary card for a CRM client.
 * Composes Avatar + StageBadge + FollowupBadge into a tappable list item.
 */
function ClientCard({
  client,
  onClick
}) {
  const [hovered, setHovered] = React.useState(false);
  const {
    name,
    company,
    stage,
    followup
  } = client;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    style: {
      display: 'flex',
      gap: 'var(--space-3)',
      alignItems: 'flex-start',
      padding: 'var(--space-4)',
      background: hovered && onClick ? 'var(--bg-surface-2)' : 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      cursor: onClick ? 'pointer' : 'default',
      boxShadow: 'var(--shadow-sm)',
      transition: 'background-color 120ms',
      fontFamily: 'var(--font-family)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: name,
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 'var(--space-2)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-base)',
      fontWeight: 600,
      color: 'var(--text-primary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, name), company && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      marginTop: '2px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, company)), /*#__PURE__*/React.createElement(__ds_scope.StageBadge, {
    stage: stage
  })), followup && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(__ds_scope.FollowupBadge, {
    status: followup
  }))));
}
Object.assign(__ds_scope, { ClientCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ClientCard.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
/**
 * Labeled text input with error, helper, prefix/suffix, and disabled states.
 */
function Input({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  disabled = false,
  error,
  helper,
  prefix,
  suffix,
  required = false,
  id
}) {
  const [focused, setFocused] = React.useState(false);
  const inputId = id || React.useId ? React.useId() : `input-${Math.random().toString(36).slice(2)}`;
  const borderColor = error ? 'var(--error-500)' : focused ? 'var(--focus-ring)' : 'var(--border)';
  const boxShadow = error ? '0 0 0 3px oklch(0.97 0.025 25 / 0.5)' : focused ? '0 0 0 3px oklch(0.70 0.175 48 / 0.22)' : 'none';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-1)',
      width: '100%',
      fontFamily: 'var(--font-family)'
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontSize: 'var(--text-sm)',
      fontWeight: 500,
      color: error ? 'var(--error-600)' : 'var(--text-primary)',
      lineHeight: 1.4,
      display: 'flex',
      gap: '2px'
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--error-500)'
    }
  }, "*")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${borderColor}`,
      boxShadow,
      background: disabled ? 'var(--bg-surface-2)' : 'var(--bg-surface)',
      transition: 'border-color 120ms, box-shadow 120ms',
      overflow: 'hidden'
    }
  }, prefix && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 12px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      color: 'var(--text-tertiary)',
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-surface-2)',
      flexShrink: 0,
      fontSize: 'var(--text-base)'
    }
  }, prefix), /*#__PURE__*/React.createElement("input", {
    id: inputId,
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    required: required,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      height: '40px',
      padding: '0 12px',
      fontSize: 'var(--text-base)',
      fontFamily: 'var(--font-family)',
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      minWidth: 0
    }
  }), suffix && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 12px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      color: 'var(--text-tertiary)',
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-surface-2)',
      flexShrink: 0,
      fontSize: 'var(--text-base)'
    }
  }, suffix)), (error || helper) && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 'var(--text-sm)',
      lineHeight: 1.4,
      color: error ? 'var(--error-600)' : 'var(--text-secondary)'
    }
  }, error || helper));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.ClientCard = __ds_scope.ClientCard;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.FollowupBadge = __ds_scope.FollowupBadge;

__ds_ns.StageBadge = __ds_scope.StageBadge;

__ds_ns.Input = __ds_scope.Input;

})();
