// src/views/DetailOverlay.jsx

import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useNavigation } from "../state/NavigationContext.jsx";
import { ArtistView } from "./ArtistView.jsx";
import { AlbumView } from "./AlbumView.jsx";

const overlayTransition = {
	duration: 0.28,
	ease: [0.22, 1, 0.36, 1],
};

export function DetailOverlay() {
	const { stack, current, goBack, closeAll } = useNavigation();

	const isOpen = stack.length > 0;
	const canGoBack = stack.length > 1;

	return (
		<AnimatePresence>
			{isOpen && current && (
				<motion.div
					key="detail-overlay"
					className="settings-overlay detail-overlay"
					initial={{ y: "100%" }}
					animate={{ y: 0 }}
					exit={{ y: "100%" }}
					transition={overlayTransition}
				>
					<button
						className="detail-overlay__back"
						onClick={canGoBack ? goBack : closeAll}
						aria-label={canGoBack ? "Back" : "Close"}
					>
						{canGoBack ? (
							<ChevronLeft size={22} strokeWidth={2} />
						) : (
							<ChevronDown size={22} strokeWidth={2} />
						)}
					</button>

					<div className="view__scroll scroll-region detail-overlay__body">
						{current.type === "artist" ? (
							<ArtistView
								key={current.id}
								artistId={current.id}
							/>
						) : (
							<AlbumView
								key={current.id}
								albumId={current.id}
							/>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
;
