# React Hooks Standards

_Standards for custom hooks design, patterns, and best practices_


## Core Principles

### Naming Convention

All custom hooks must start with "use" prefix for React rule compliance.

```typescript
// ✅ GOOD: proper hook naming
useUserData(userId: string)
useApiRequest<T>(url: string)
useLocalStorage(key: string)

// ❌ BAD: missing prefix or unclear names
getUserData(userId: string)  // missing 'use' prefix
useData()                    // too generic
```

### Consistent Return Interface

Maintain predictable return patterns for similar functionality types.

```typescript
// ✅ GOOD: consistent async pattern
interface UseDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useData<T>(url: string): UseDataReturn<T> {
  // implementation...
  return { data, loading, error, refetch };
}

// ❌ BAD: inconsistent return structure
function useBadData(url: string) {
  return [data, isLoading, err, reload]; // unpredictable array
}
```

### Dependency Management

Proper dependency handling prevents bugs and ensures predictable behavior.

```typescript
// ✅ GOOD: correct dependencies
export function useUserData(userId: string) {
  const [userData, setUserData] = useState<User | null>(null);
  
  const refreshUser = useCallback(async () => {
    if (!userId) return;
    const user = await fetchUser(userId);
    setUserData(user);
  }, [userId]); // correct dependency
  
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);
  
  return { userData, refreshUser };
}

// ❌ BAD: missing dependencies
function useBadEffect(user: User) {
  useEffect(() => {
    fetchUserData(user.id).then(setData);
  }, []); // missing user.id dependency
}
```

## Rule Groups

- `RH-NAMING-*`: Custom hook naming — `use` prefix required, descriptive non-generic names.
- `RH-RETURN-*`: Consistent return interfaces — object for named fields, tuple for ordered pairs, single value for primitives.
- `RH-DEPS-*`: Dependency arrays — include every external value read inside the effect/callback/memo.
- `RH-ASYNC-*`: Async data hooks — standard `{ data, loading, error, refetch }` shape with cleanup.
- `RH-CLEANUP-*`: Effect cleanup — cancel async work, clear timers, abort fetches on unmount.
- `RH-STABLE-*`: Stable return values — memoize objects/arrays returned from hooks.
- `RH-COMPOSE-*`: Hook composition — build complex hooks from simpler ones.
- `RH-REDUCER-*`: `useReducer` for complex multi-field state with related updates.
