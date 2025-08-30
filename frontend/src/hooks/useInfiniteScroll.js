import { useEffect, useRef, useCallback } from 'react';

const useInfiniteScroll = (callback, hasMore, loading) => {
    const observer = useRef();

    const lastElementRef = useCallback((node) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                callback();
            }
        });

        if (node) observer.current.observe(node);
    }, [loading, hasMore, callback]);

    useEffect(() => {
        return () => {
            if (observer.current) observer.current.disconnect();
        };
    }, []);

    return lastElementRef;
};

export default useInfiniteScroll;