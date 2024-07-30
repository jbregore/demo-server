// exports.isAdmin = async(req, res, next) => {
//     try {
//         if(req.session.user.isAdmin){
//             next();
//         } else {
//             return res.status(500).json({ authorization: false, message: 'not authorized.' });
//         }
//     } catch(err) {
//         res.status(500).json({ authorization: false, error: err.message });
//     }
// }

exports.isUser = async(req, res, next) => {
    try {
        const userId = req.header('user-id');

        if(userId == req.params.id) {
            next();
        } else {
            return res.status(500).json({ authorization: false, message: 'not authorized.' });
        }

    } catch(err) {
        res.status(500).json({ authorization: false, error: err.message });
    }
}