"use client";

import { Bell, Search, UserRound, MapPin } from "lucide-react";
import Logo from "./Logo";
import Link from "next/link";
import AccountDropdown from "./AccountDropdown";
import EditProfileDialog from "./EditProfileDialog";
import { useState, useRef, useEffect, useCallback } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "./ui/skeleton";

interface UserResult {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    is_self: boolean;
}

interface ParkResult {
    park_code: string;
    name: string;
    states: string;
}

interface SearchResults {
    users: UserResult[];
    parks: ParkResult[];
}

export default function NavBar() {
    const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
    const { user, isLoaded } = useUser();
    const { signOut } = useClerk();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const router = useRouter();
    const [username, setUsername] = useState<string | null>(null);
    const [visitedParksCount, setVisitedParksCount] = useState(0);
    const [totalParksCount, setTotalParksCount] = useState(0);
    const [bio, setBio] = useState<string>("");
    const [editProfileOpen, setEditProfileOpen] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResults>({ users: [], parks: [] });
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const runSearch = useCallback((q: string) => {
        if (!q.trim()) { setSearchResults({ users: [], parks: [] }); setSearchOpen(false); return; }
        const encoded = encodeURIComponent(q);
        Promise.all([
            fetch(`/api/users/search?q=${encoded}`).then(r => r.ok ? r.json() : []),
            fetch(`/api/parks/search?q=${encoded}`).then(r => r.ok ? r.json() : []),
        ]).then(([users, parks]: [UserResult[], ParkResult[]]) => {
            setSearchResults({ users, parks });
            setSearchOpen(users.length > 0 || parks.length > 0);
        }).catch(() => {});
    }, []);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const q = e.target.value;
        setSearchQuery(q);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => runSearch(q), 250);
    };

    const handleSelect = (href: string) => {
        setSearchQuery("");
        setSearchResults({ users: [], parks: [] });
        setSearchOpen(false);
        router.push(href);
    };

    useEffect(() => {
        if (!isLoaded || !user) return;
        fetch('/api/users/me')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (data.username) setUsername(data.username);
                if (data.bio != null) setBio(data.bio ?? "");
                if (data.visited_count != null) setVisitedParksCount(data.visited_count);
                if (data.total_parks_count != null) setTotalParksCount(data.total_parks_count);
            })
            .catch(() => {});
    }, [isLoaded, user]);

    const fullName = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.firstName || user?.lastName || 'User';
    
    const emailVerified = user?.emailAddresses?.find(email => email.id === user.primaryEmailAddressId)?.verification?.status === 'verified';
    const profileImageUrl = user?.imageUrl || '';

    // Close dropdowns when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setAccountDropdownOpen(false);
            }
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await signOut();
        setAccountDropdownOpen(false);
    };

    return (
        <>
        <nav className="bg-gray-50 border-b border-gray-200 sticky top-0 z-[1000]">
            <div className="max-w-full px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">

                    {/* Left Side */}
                    <div className="flex items-center space-x-8">
                        
                        {/* Branding */}
                        <Logo />

                        {/* Navigation Links */}
                        <div className="hidden md:flex space-x-1">
                            <Link 
                                href="/map" 
                                className={`px-4 py-2 rounded-lg font-medium transition ${
                                    pathname === '/map'
                                        ? 'font-semibold text-green-600 bg-green-50'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                Map
                            </Link>
                            <Link
                                href={username ? `/profile/${username}` : '/visits'}
                                className={`px-4 py-2 rounded-lg font-medium transition ${
                                    username && pathname === `/profile/${username}`
                                        ? 'font-semibold text-green-600 bg-green-50'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                My Visits
                            </Link>
                            <Link
                                href="/feed"
                                className={`px-4 py-2 rounded-lg font-medium transition ${
                                    pathname === '/feed' || (pathname.startsWith('/profile') && pathname !== `/profile/${username ?? ''}`)
                                        ? 'font-semibold text-green-600 bg-green-50'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                Feed
                            </Link>
                            <Link
                                href="/parks"
                                className={`px-4 py-2 rounded-lg font-medium transition ${
                                    pathname === '/parks'
                                        ? 'font-semibold text-green-600 bg-green-50'
                                        : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                Explore
                            </Link>
                        </div>
                    </div>

                    {/* Right Side */}
                    <div className="flex items-center gap-3">

                    {/* Search */}
                    <div ref={searchRef} className="relative hidden md:block w-72">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onFocus={() => { if (searchResults.users.length > 0 || searchResults.parks.length > 0) setSearchOpen(true); }}
                            placeholder="Search parks or users…"
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 border border-transparent rounded-lg outline-none focus:bg-white focus:border-gray-300 transition-colors"
                        />
                        {searchOpen && (
                            <div className="absolute top-full mt-1.5 right-0 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
                                {searchResults.parks.length > 0 && (
                                    <>
                                        <div className="flex items-center justify-between px-4 pt-3 pb-1">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Parks</p>
                                            <Link href="/parks" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors">All parks →</Link>
                                        </div>
                                        {searchResults.parks.map(park => (
                                            <button
                                                key={park.park_code}
                                                onClick={() => handleSelect(`/parks/${park.park_code}`)}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                                    <MapPin className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{park.name}</p>
                                                    <p className="text-xs text-gray-400 truncate">{park.states}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </>
                                )}
                                {searchResults.users.length > 0 && (
                                    <>
                                        <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Users</p>
                                        {searchResults.users.map(user => (
                                            <button
                                                key={user.username}
                                                onClick={() => handleSelect(`/profile/${user.username}`)}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                            >
                                                {user.avatar_url ? (
                                                    <img src={user.avatar_url} alt={user.username} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                                        <UserRound className="w-4 h-4 text-gray-500" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    {user.full_name && <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}{user.is_self ? " (you)" : ""}</p>}
                                                    <p className="text-xs text-gray-500 truncate">@{user.username}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </>
                                )}
                                <div className="h-2" />
                            </div>
                        )}
                    </div>

                        {/* Notification Bell */}
                        <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition hover:cursor-pointer">
                            <Bell className="w-6 h-6" />
                        </button>

                        {/* User */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                                className="flex items-center space-x-3 hover:bg-gray-100 rounded-lg px-2 py-1 transition hover:cursor-pointer"
                            >
                                <div className="text-right hidden sm:block">
                                    {isLoaded ? (<div className="text-sm font-medium text-gray-900">{fullName}</div>) : (<Skeleton className="h-4 w-20 rounded-md bg-gray-300 mb-2" />)}
                                    {isLoaded ? (<div className="text-xs text-gray-500">{visitedParksCount}/{totalParksCount} Parks</div>) : (<Skeleton className="h-2 w-20 rounded-md bg-gray-300" />)}
                                </div>
                                {isLoaded ? (<img 
                                    src={profileImageUrl} 
                                    alt={fullName}
                                    className="w-10 h-10 rounded-full border-2 border-green-500 object-cover" 
                                />) : (<Skeleton className="w-10 h-10 rounded-full bg-gray-300 border-green-500 border-2" />)}
                            </button>
                            
                            <AccountDropdown isOpen={accountDropdownOpen} onSignOut={handleSignOut} username={username} onEditProfile={() => { setAccountDropdownOpen(false); setEditProfileOpen(true); }} />
                        </div>

                    </div>
                </div>
            </div>
        </nav>

        <EditProfileDialog
            open={editProfileOpen}
            onOpenChange={setEditProfileOpen}
        />
        </>
    );
}