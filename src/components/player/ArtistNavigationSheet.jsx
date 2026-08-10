// src/components/player/ArtistNavigationSheet.jsx

import { AnimatePresence, motion } from "motion/react";

const sheetTransition = {
	duration: 0.22,
	ease: [0.22, 1, 0.36, 1],
};

const scrimTransition = {
	duration: 0.18,
	ease: "easeOut",
};

export function ArtistNavigationSheet({
	isOpen,
	artistName,
	onClose,
	onViewArtist,
	onViewAlbum,
}) {
	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						key="nav-sheet-scrim"
						className="nav-sheet__scrim"
						onClick={onClose}
						role="presentation"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={scrimTransition}
					/>

					<motion.div
						key="nav-sheet"
						className="nav-sheet"
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={sheetTransition}
					>
						<p className="nav-sheet__title">
							{artistName}
						</p>

						<button
							className="nav-sheet__option"
							onClick={onViewArtist}
						>
							View Artist
						</button>

						<button
							className="nav-sheet__option"
							onClick={onViewAlbum}
						>
							View Album
						</button>

						<button
							className="nav-sheet__cancel"
							onClick={onClose}
						>
							Cancel
						</button>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}
;